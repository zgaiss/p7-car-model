package com.show.p7;

import android.app.Service;
import android.content.Intent;
import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.TextView;

import com.xpeng.p7show.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;

/**
 * 红绿灯悬浮条（仿原包 com.xiaopeng.light 的悬浮窗）。
 *
 * 数据链路：LightSdkController 每 500ms 把同一份 window.__lightData 交给
 * LightSdkController.sharedListener → 本 Service.apply(json) → 原生 View 刷新。
 * 用原生 View 而不是 WebView，避免再触发 WebView GPU 崩溃。
 */
public class LightOverlayService extends Service {

    private static final String TAG = "P7Overlay";
    public static final String ACTION_SHOW = "com.show.p7.overlay.SHOW";
    public static final String ACTION_HIDE = "com.show.p7.overlay.HIDE";

    private static volatile LightOverlayService instance;

    /** 用户是否开启了悬浮条（与服务生命周期解耦：前台时只是不显示） */
    private boolean enabled = false;
    /** App 是否在前台：前台时不显示悬浮条，避免和 App 内卡片重复 */
    private boolean appForeground = true;

    private WindowManager wm;
    private View root;
    private WindowManager.LayoutParams params;
    private TextView tvSpeed, tvDist, tvDistUnit, tvLeftSec, tvStraightSec;
    private ImageView ivLeft, ivStraight;
    private TextView tvDistanceUnit;
    private String curLeftKey = "", curStraightKey = "";
    private float touchX, touchY;
    private int startX, startY;

    public static boolean isShowing() {
        return instance != null && instance.root != null;
    }

    /** 用户是否开启了悬浮条（即使当前因前台被隐藏，也算开启） */
    public static boolean isEnabled() {
        return instance != null && instance.enabled;
    }

    /** App 前后台切换：前台隐藏悬浮条，后台显示 */
    public static void setAppForeground(boolean foreground) {
        final LightOverlayService s = instance;
        if (s == null) {
            return;
        }
        s.appForeground = foreground;
        if (s.root != null) {
            s.root.post(new Runnable() {
                @Override
                public void run() {
                    s.syncVisibility();
                }
            });
        } else {
            s.syncVisibility();
        }
    }

    /** 由 LightSdkController 推送（主线程或任意线程均可，内部切换到主线程） */
    public static void pushData(final String json) {
        final LightOverlayService s = instance;
        if (s == null || s.root == null) {
            return;
        }
        s.root.post(new Runnable() {
            @Override
            public void run() {
                s.apply(json);
            }
        });
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_SHOW : intent.getAction();
        if (ACTION_HIDE.equals(action)) {
            enabled = false;
            hide();
            stopSelf();
            return START_NOT_STICKY;
        }
        enabled = true;
        syncVisibility();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        hide();
        instance = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /** 根据 开关状态 + 前后台 决定是否展示悬浮条 */
    private void syncVisibility() {
        if (enabled && !appForeground) {
            showView();
        } else {
            hide();
        }
    }

    private void showView() {
        if (root != null) {
            return;
        }
        if (!Settings.canDrawOverlays(this)) {
            Log.w(TAG, "no overlay permission");
            return;
        }
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        root = LayoutInflater.from(this).inflate(R.layout.view_light_overlay, null);
        tvSpeed = root.findViewById(R.id.tvSpeed);
        tvDist = root.findViewById(R.id.tvDistance);
        tvDistUnit = root.findViewById(R.id.tvDistanceUnit);
        tvLeftSec = root.findViewById(R.id.tvLeftSec);
        tvStraightSec = root.findViewById(R.id.tvStraightSec);
        ivLeft = root.findViewById(R.id.ivLeft);
        ivStraight = root.findViewById(R.id.ivStraight);

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = 40;
        params.y = 120;

        root.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        touchX = event.getRawX();
                        touchY = event.getRawY();
                        startX = params.x;
                        startY = params.y;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        params.x = startX + (int) (event.getRawX() - touchX);
                        params.y = startY + (int) (event.getRawY() - touchY);
                        try {
                            wm.updateViewLayout(root, params);
                        } catch (Throwable ignored) {
                        }
                        return true;
                    default:
                        return false;
                }
            }
        });

        try {
            wm.addView(root, params);
            Log.i(TAG, "overlay shown");
        } catch (Throwable t) {
            Log.e(TAG, "addView failed: " + t.getMessage());
            root = null;
        }
    }

    private void hide() {
        if (root != null && wm != null) {
            try {
                wm.removeView(root);
            } catch (Throwable ignored) {
            }
        }
        root = null;
    }

    /** 解析 window.__lightData 的 JSON 并刷新原生 View */
    private void apply(String json) {
        if (json == null || root == null) {
            return;
        }
        try {
            int start = json.indexOf('{');
            int end = json.lastIndexOf('}');
            if (start < 0 || end <= start) {
                return;
            }
            JSONObject d = new JSONObject(json.substring(start, end + 1));
            int speed = d.optInt("speed", -1);
            int dist = d.optInt("dist", -1);
            tvSpeed.setText(speed >= 0 ? String.valueOf(speed) : "--");

            if (dist >= 0) {
                tvDist.setText(String.valueOf(dist));
                tvDistUnit.setVisibility(View.VISIBLE);
            } else {
                tvDist.setText("");
                tvDistUnit.setVisibility(View.GONE);
            }

            JSONArray lights = d.optJSONArray("lights");
            int leftSec = Integer.MIN_VALUE, straightSec = Integer.MIN_VALUE;
            int leftState = 0, straightState = 0;
            if (lights != null) {
                for (int i = 0; i < lights.length(); i++) {
                    JSONObject l = lights.optJSONObject(i);
                    if (l == null) {
                        continue;
                    }
                    int dir = l.optInt("flowDir", 0);
                    int state = l.optInt("state", 0);
                    int sec = l.optInt("remainSec", 0);
                    if (dir == 1) {
                        leftState = state;
                        leftSec = sec;
                    } else if (dir == 2) {
                        straightState = state;
                        straightSec = sec;
                    }
                }
            }

            bindLight(ivLeft, tvLeftSec, 1, leftState, leftSec, true);
            bindLight(ivStraight, tvStraightSec, 2, straightState, straightSec, false);
        } catch (Throwable t) {
            Log.w(TAG, "apply failed: " + t.getMessage());
        }
    }

    private void bindLight(ImageView iv, TextView tv, int dir, int state, int sec, boolean isLeft) {
        if (sec == Integer.MIN_VALUE || state == 0) {
            iv.setVisibility(View.GONE);
            tv.setText("");
            return;
        }
        iv.setVisibility(View.VISIBLE);
        int color = state == 2 ? 0xFF00B849 : (state == 1 ? 0xFFF72D2D : 0xFFF0CF4A);
        tv.setTextColor(color);
        tv.setText(sec > 0 ? String.valueOf(sec) : (state == 2 ? "通行" : String.valueOf(sec)));

        String dirKey = isLeft ? "left" : "straight";
        String stKey = state == 2 ? "green" : (state == 1 ? "red" : "yellow");
        String key = dirKey + "_" + stKey;
        String cur = isLeft ? curLeftKey : curStraightKey;
        if (key.equals(cur)) {
            return;
        }
        try {
            AssetManager am = getAssets();
            InputStream in = am.open("light/icon_" + dirKey + "_" + stKey + "_n.webp");
            Bitmap bmp = BitmapFactory.decodeStream(in);
            if (in != null) {
                in.close();
            }
            if (bmp != null) {
                int px = (int) (50 * getResources().getDisplayMetrics().density);
                Bitmap scaled = Bitmap.createScaledBitmap(bmp, px, px, true);
                iv.setImageBitmap(scaled);
                if (isLeft) {
                    curLeftKey = key;
                } else {
                    curStraightKey = key;
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "icon load failed: " + key);
        }
    }
}
