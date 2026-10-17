var P7WaveCubes = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // upstream/src/animations/Cubes.ts
  var Cubes_exports = {};
  __export(Cubes_exports, {
    Cubes: () => Cubes
  });

  // upstream/src/util/Shapes.ts
  var Shapes = class {
    constructor(canvasContext) {
      __publicField(this, "_canvasContext");
      this._canvasContext = canvasContext;
    }
    toRadians(degrees) {
      return degrees * Math.PI / 180;
    }
    toDegrees(radians) {
      return radians * 180 / Math.PI;
    }
    _rotatePoint(originX, originY, pointX, pointY, degrees) {
      let angle = this.toRadians(degrees);
      let x = Math.cos(angle) * (pointX - originX) - Math.sin(angle) * (pointY - originY) + originX;
      let y = Math.sin(angle) * (pointX - originX) + Math.cos(angle) * (pointY - originY) + originY;
      return { x, y };
    }
    _makeGradient(colors, rotate) {
      let startX = 0;
      let startY = this._canvasContext.canvas.height / 2;
      let endX = this._canvasContext.canvas.width;
      let endY = this._canvasContext.canvas.height / 2;
      if (rotate) {
        let originX = this._canvasContext.canvas.width / 2;
        let originY = this._canvasContext.canvas.height / 2;
        let rotatedStart = this._rotatePoint(originX, originY, startX, startY, rotate);
        startX = rotatedStart.x;
        startY = rotatedStart.y;
        let rotatedEnd = this._rotatePoint(originX, originY, endX, endY, rotate);
        endX = rotatedEnd.x;
        endY = rotatedEnd.y;
      }
      let gradient = this._canvasContext.createLinearGradient(startX, startY, endX, endY);
      colors.forEach((color, i) => {
        gradient.addColorStop(1 / colors.length * i, color);
      });
      return gradient;
    }
    async _makeImage(srcUrl) {
      let img = new Image();
      img.src = srcUrl;
      return new Promise((res, rej) => {
        img.onload = () => {
          let pattern = this._canvasContext.createPattern(img, "repeat");
          res(pattern);
        };
      });
    }
    _implementOptions(options, closePath = true) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
      if (typeof (options == null ? void 0 : options.lineColor) == "string")
        this._canvasContext.strokeStyle = options.lineColor;
      else if ((_a = options == null ? void 0 : options.lineColor) == null ? void 0 : _a.gradient)
        this._canvasContext.strokeStyle = this._makeGradient(options.lineColor.gradient, options.lineColor.rotate);
      else if ((_b = options == null ? void 0 : options.lineColor) == null ? void 0 : _b.image)
        this._makeImage((_c = options == null ? void 0 : options.lineColor) == null ? void 0 : _c.image).then((img) => this._canvasContext.strokeStyle = img);
      else
        this._canvasContext.strokeStyle = "#000";
      if (typeof (options == null ? void 0 : options.fillColor) == "string")
        this._canvasContext.fillStyle = options.fillColor;
      else if ((_d = options == null ? void 0 : options.fillColor) == null ? void 0 : _d.gradient)
        this._canvasContext.fillStyle = this._makeGradient(options.fillColor.gradient, options.fillColor.rotate);
      else if ((_e = options == null ? void 0 : options.fillColor) == null ? void 0 : _e.image)
        this._makeImage((_f = options == null ? void 0 : options.fillColor) == null ? void 0 : _f.image).then((img) => this._canvasContext.fillStyle = img);
      else
        this._canvasContext.fillStyle = "#000";
      this._canvasContext.lineCap = (_g = (options == null ? void 0 : options.rounded) ? "round" : "butt") != null ? _g : "butt";
      this._canvasContext.lineWidth = (_h = options == null ? void 0 : options.lineWidth) != null ? _h : 1;
      this._canvasContext.shadowColor = (_j = (_i = options == null ? void 0 : options.glow) == null ? void 0 : _i.color) != null ? _j : "rgba(0,0,0,0)";
      this._canvasContext.shadowBlur = (_l = (_k = options == null ? void 0 : options.glow) == null ? void 0 : _k.strength) != null ? _l : 0;
      this._canvasContext.shadowOffsetX = 0;
      this._canvasContext.shadowOffsetY = 0;
      if (closePath) this._canvasContext.closePath();
      this._canvasContext.stroke();
      if (closePath) this._canvasContext.fill();
    }
    arc(x, y, diameter, startAngleInDegrees, endAngleInDegrees, options) {
      this._canvasContext.beginPath();
      this._canvasContext.arc(x, y, diameter / 2, this.toRadians(startAngleInDegrees), this.toRadians(endAngleInDegrees));
      this._implementOptions(options, false);
      return this;
    }
    circle(x, y, diameter, options) {
      this._canvasContext.beginPath();
      this._canvasContext.arc(x, y, diameter / 2, 0, 2 * Math.PI);
      this._implementOptions(options);
      return this;
    }
    line(fromX, fromY, toX, toY, options) {
      this._canvasContext.beginPath();
      this._canvasContext.moveTo(fromX, fromY);
      this._canvasContext.lineTo(toX, toY);
      this._implementOptions(options);
      return this;
    }
    polygon(points, options) {
      var _a;
      this._canvasContext.beginPath();
      this._canvasContext.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length; i++) {
        let point = points[i];
        let nextPoint = (_a = points[i + 1]) != null ? _a : point;
        let xc = (point.x + nextPoint.x) / 2;
        let yc = (point.y + nextPoint.y) / 2;
        if (options == null ? void 0 : options.rounded)
          this._canvasContext.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        else
          this._canvasContext.lineTo(points[i].x, points[i].y);
      }
      this._implementOptions(options);
      return this;
    }
    rectangle(x, y, width, height, options) {
      var _a;
      let radius = (_a = options == null ? void 0 : options.radius) != null ? _a : 0;
      if (width < 2 * radius) radius = width / 2;
      if (height < 2 * radius) radius = height / 2;
      this._canvasContext.beginPath();
      this._canvasContext.moveTo(x + radius, y);
      this._canvasContext.arcTo(x + width, y, x + width, y + height, radius);
      this._canvasContext.arcTo(x + width, y + height, x, y + height, radius);
      this._canvasContext.arcTo(x, y + height, x, y, radius);
      this._canvasContext.arcTo(x, y, x + width, y, radius);
      this._implementOptions(options);
      return this;
    }
  };

  // upstream/src/util/AudioData.ts
  var AudioData = class {
    constructor(audioBufferData) {
      __publicField(this, "data");
      this.data = audioBufferData;
    }
    setFrequencyBand(band) {
      let baseLength = Math.floor(this.data.length * 0.0625);
      let lowsLength = Math.floor(this.data.length * 0.0625);
      let midsLength = Math.floor(this.data.length * 0.375);
      ;
      let bands = {
        base: this.data.slice(0, baseLength),
        lows: this.data.slice(baseLength + 1, baseLength + lowsLength),
        mids: this.data.slice(baseLength + lowsLength + 1, baseLength + lowsLength + midsLength),
        highs: this.data.slice(baseLength + lowsLength + midsLength + 1)
      };
      this.data = bands[band];
    }
    scaleData(maxSize) {
      if (!(maxSize < 255)) return;
      this.data = this.data.map((value) => {
        let percent = Math.round(value / 255 * 100) / 100;
        return maxSize * percent;
      });
    }
  };

  // upstream/src/animations/Cubes.ts
  var Cubes = class {
    constructor(options) {
      __publicField(this, "_options");
      this._options = options != null ? options : {};
    }
    draw(audioBufferData, canvas) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
      const { height, width } = canvas.canvas;
      const shapes = new Shapes(canvas);
      const audioData = new AudioData(audioBufferData);
      this._options = __spreadValues({
        count: 20,
        frequencyBand: "mids",
        gap: 5
      }, this._options);
      const cubeWidth = Math.floor((width - this._options.gap * this._options.count) / this._options.count);
      if (!((_a = this._options) == null ? void 0 : _a.cubeHeight)) this._options.cubeHeight = cubeWidth;
      if (this._options.frequencyBand) audioData.setFrequencyBand(this._options.frequencyBand);
      audioData.scaleData(Math.min(width, height));
      if ((_b = this._options) == null ? void 0 : _b.mirroredX) {
        let n = 1;
        for (let i = Math.ceil(audioData.data.length / 2); i < audioData.data.length; i++) {
          audioData.data[i] = audioData.data[Math.ceil(audioData.data.length / 2) - n];
          n++;
        }
      }
      if ((_c = this._options) == null ? void 0 : _c.top) {
        for (let i = 0; i < this._options.count; i++) {
          let dataIndex = Math.floor(audioData.data.length / this._options.count) * i;
          let dataValue = audioData.data[dataIndex];
          let x = (this._options.gap + cubeWidth) * i;
          let cubeCount = Math.ceil(dataValue / cubeWidth);
          for (let j = 0; j < cubeCount; j++) {
            let y = j * (this._options.cubeHeight + this._options.gap);
            shapes.rectangle(x, y, cubeWidth, this._options.cubeHeight, this._options);
          }
        }
      }
      if ((_d = this._options) == null ? void 0 : _d.right) {
        for (let i = 0; i < this._options.count; i++) {
          let dataIndex = Math.floor(audioData.data.length / this._options.count) * i;
          let dataValue = audioData.data[dataIndex];
          let y = i * (this._options.cubeHeight + this._options.gap);
          let cubeCount = Math.ceil(dataValue / cubeWidth);
          for (let j = 0; j < cubeCount; j++) {
            let x = width - (this._options.gap + cubeWidth) * j;
            shapes.rectangle(x, y, cubeWidth, this._options.cubeHeight, this._options);
          }
        }
      }
      if (((_e = this._options) == null ? void 0 : _e.bottom) || !((_f = this._options) == null ? void 0 : _f.top) && !((_g = this._options) == null ? void 0 : _g.right) && !((_h = this._options) == null ? void 0 : _h.left) && !((_i = this._options) == null ? void 0 : _i.center)) {
        for (let i = 0; i < this._options.count; i++) {
          let dataIndex = Math.floor(audioData.data.length / this._options.count) * i;
          let dataValue = audioData.data[dataIndex];
          let x = (this._options.gap + cubeWidth) * i;
          let cubeCount = Math.ceil(dataValue / cubeWidth);
          for (let j = 0; j < cubeCount; j++) {
            let y = height - j * (this._options.cubeHeight + this._options.gap);
            shapes.rectangle(x, y, cubeWidth, this._options.cubeHeight, this._options);
          }
        }
      }
      if ((_j = this._options) == null ? void 0 : _j.left) {
        for (let i = 0; i < this._options.count; i++) {
          let dataIndex = Math.floor(audioData.data.length / this._options.count) * i;
          let dataValue = audioData.data[dataIndex];
          let y = i * (this._options.cubeHeight + this._options.gap);
          let cubeCount = Math.ceil(dataValue / cubeWidth);
          for (let j = 0; j < cubeCount; j++) {
            let x = (this._options.gap + cubeWidth) * j;
            shapes.rectangle(x, y, cubeWidth, this._options.cubeHeight, this._options);
          }
        }
      }
      if ((_k = this._options) == null ? void 0 : _k.center) {
        for (let i = 0; i < this._options.count; i++) {
          let dataIndex = Math.floor(audioData.data.length / this._options.count) * i;
          let dataValue = audioData.data[dataIndex];
          let x = (this._options.gap + cubeWidth) * i;
          let cubeCount = Math.ceil(dataValue / cubeWidth);
          for (let j = 0; j < cubeCount; j++) {
            let y = height / 2 - j * (this._options.cubeHeight + this._options.gap);
            shapes.rectangle(x, y, cubeWidth, this._options.cubeHeight, this._options);
          }
        }
        if ((_l = this._options) == null ? void 0 : _l.mirroredY) {
          for (let i = 0; i < this._options.count; i++) {
            let dataIndex = Math.floor(audioData.data.length / this._options.count) * i;
            let dataValue = audioData.data[dataIndex];
            let x = (this._options.gap + cubeWidth) * i;
            let cubeCount = Math.ceil(dataValue / cubeWidth);
            for (let j = 0; j < cubeCount; j++) {
              let y = height / 2 + j * (this._options.cubeHeight + this._options.gap);
              shapes.rectangle(x, y, cubeWidth, this._options.cubeHeight, this._options);
            }
          }
        }
      }
    }
  };
  return __toCommonJS(Cubes_exports);
})();
