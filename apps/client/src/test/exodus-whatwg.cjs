var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// ../../node_modules/.pnpm/@exodus+bytes@1.15.1/node_modules/@exodus/bytes/whatwg.js
var whatwg_exports = {};
__export(whatwg_exports, {
  percentEncodeAfterEncoding: () => percentEncodeAfterEncoding
});
module.exports = __toCommonJS(whatwg_exports);

// ../../node_modules/.pnpm/@exodus+bytes@1.15.1/node_modules/@exodus/bytes/fallback/platform.native.js
var { Buffer: Buffer2 } = globalThis;
var haveNativeBuffer = Buffer2 && !Buffer2.TYPED_ARRAY_SUPPORT;
var nativeBuffer = haveNativeBuffer ? Buffer2 : null;
var isHermes = /* @__PURE__ */ (() => !!globalThis.HermesInternal)();
var isDeno = /* @__PURE__ */ (() => !!globalThis.Deno)();
var isLE = /* @__PURE__ */ (() => new Uint8Array(Uint16Array.of(258).buffer)[0] === 2)();
var isNative = (x) => x && (haveNativeBuffer || `${x}`.includes("[native code]"));
if (!haveNativeBuffer && isNative(() => {
})) isNative = () => false;
var nativeDecoder = /* @__PURE__ */ (() => isNative(globalThis.TextDecoder) ? new TextDecoder("utf-8", { ignoreBOM: true }) : null)();
var nativeDecoderLatin1 = /* @__PURE__ */ (() => {
  if (nativeDecoder) {
    try {
      return new TextDecoder("latin1", { ignoreBOM: true });
    } catch {
    }
  }
  return null;
})();
function decodePartAddition(a, start, end, m) {
  let o = "";
  let i = start;
  for (const last3 = end - 3; i < last3; i += 4) {
    const x0 = a[i];
    const x1 = a[i + 1];
    const x2 = a[i + 2];
    const x3 = a[i + 3];
    o += m[x0];
    o += m[x1];
    o += m[x2];
    o += m[x3];
  }
  while (i < end) o += m[a[i++]];
  return o;
}
function decodePartTemplates(a, start, end, m) {
  let o = "";
  let i = start;
  for (const last15 = end - 15; i < last15; i += 16) {
    const x0 = a[i];
    const x1 = a[i + 1];
    const x2 = a[i + 2];
    const x3 = a[i + 3];
    const x4 = a[i + 4];
    const x5 = a[i + 5];
    const x6 = a[i + 6];
    const x7 = a[i + 7];
    const x8 = a[i + 8];
    const x9 = a[i + 9];
    const x10 = a[i + 10];
    const x11 = a[i + 11];
    const x12 = a[i + 12];
    const x13 = a[i + 13];
    const x14 = a[i + 14];
    const x15 = a[i + 15];
    o += `${m[x0]}${m[x1]}${m[x2]}${m[x3]}${m[x4]}${m[x5]}${m[x6]}${m[x7]}${m[x8]}${m[x9]}${m[x10]}${m[x11]}${m[x12]}${m[x13]}${m[x14]}${m[x15]}`;
  }
  while (i < end) o += m[a[i++]];
  return o;
}
var decodePart = isHermes ? decodePartTemplates : decodePartAddition;
function decode2string(arr, start, end, m) {
  if (end - start > 3e4) {
    const concat = [];
    for (let i = start; i < end; ) {
      const step = i + 500;
      const iNext = step > end ? end : step;
      concat.push(decodePart(arr, i, iNext, m));
      i = iNext;
    }
    const res = concat.join("");
    concat.length = 0;
    return res;
  }
  return decodePart(arr, start, end, m);
}
function encodeCharcodesHermes(str, arr) {
  const length = str.length;
  if (length > 64) {
    const at = str.charCodeAt.bind(str);
    for (let i = 0; i < length; i++) arr[i] = at(i);
  } else {
    for (let i = 0; i < length; i++) arr[i] = str.charCodeAt(i);
  }
  return arr;
}
function encodeCharcodesPure(str, arr) {
  const length = str.length;
  for (let i = 0; i < length; i++) arr[i] = str.charCodeAt(i);
  return arr;
}
var encodeCharcodes = isHermes ? encodeCharcodesHermes : encodeCharcodesPure;

// ../../node_modules/.pnpm/@exodus+bytes@1.15.1/node_modules/@exodus/bytes/fallback/_utils.js
var Buffer3 = /* @__PURE__ */ (() => globalThis.Buffer)();
var E_STRING = "Input is not a string";
var E_STRICT_UNICODE = "Input is not well-formed Unicode";
function fromBuffer(arr, format) {
  switch (format) {
    case "uint8":
      if (arr.length <= 64 || arr.byteOffset !== 0 || arr.byteLength !== arr.buffer.byteLength) {
        return new Uint8Array(arr);
      }
      return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    case "arraybuffer":
      return arr.buffer.byteLength === arr.byteLength ? arr.buffer : arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength);
    case "buffer":
      if (arr.constructor !== Buffer3) throw new Error("Unexpected");
      return arr;
  }
  throw new TypeError("Unexpected format");
}

// ../../node_modules/.pnpm/@exodus+bytes@1.15.1/node_modules/@exodus/bytes/fallback/latin1.js
var atob = /* @__PURE__ */ (() => globalThis.atob)();
var web64 = /* @__PURE__ */ (() => Uint8Array.prototype.toBase64)();
var maxFunctionArgs = 8192;
var useLatin1atob = web64 && atob;
function decodeLatin1(arr, start = 0, stop = arr.length) {
  start |= 0;
  stop |= 0;
  const total = stop - start;
  if (total === 0) return "";
  if (useLatin1atob && total >= 256 && total < 1e8 && arr.toBase64 === web64 && arr.BYTES_PER_ELEMENT === 1) {
    const sliced2 = start === 0 && stop === arr.length ? arr : arr.subarray(start, stop);
    return atob(sliced2.toBase64());
  }
  if (total > maxFunctionArgs) {
    let prefix = "";
    for (let i = start; i < stop; ) {
      const i1 = Math.min(stop, i + maxFunctionArgs);
      prefix += String.fromCharCode.apply(String, arr.subarray(i, i1));
      i = i1;
    }
    return prefix;
  }
  const sliced = start === 0 && stop === arr.length ? arr : arr.subarray(start, stop);
  return String.fromCharCode.apply(String, sliced);
}
var decodeAscii = nativeBuffer ? (a) => (
  // Buffer is faster on Node.js (but only for long enough data), if we know that output is ascii
  a.byteLength >= 768 && !isDeno ? nativeBuffer.from(a.buffer, a.byteOffset, a.byteLength).latin1Slice(0, a.byteLength) : nativeDecoder.decode(a)
) : nativeDecoderLatin1 ? (a) => nativeDecoderLatin1.decode(a) : (a) => decodeLatin1(
  a instanceof Uint8Array ? a : new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
);
var encodeLatin1 = (str) => encodeCharcodes(str, new Uint8Array(str.length));

// ../../node_modules/.pnpm/@exodus+bytes@1.15.1/node_modules/@exodus/bytes/utf8.node.js
if (Buffer.TYPED_ARRAY_SUPPORT) throw new Error("Unexpected Buffer polyfill");
var decoderFatal;
var decoderLoose = new TextDecoder("utf-8", { ignoreBOM: true });
var { isWellFormed } = String.prototype;
var isDeno2 = !!globalThis.Deno;
try {
  decoderFatal = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
} catch {
}
function encode(str, loose, format) {
  if (typeof str !== "string") throw new TypeError(E_STRING);
  const strLength = str.length;
  if (strLength === 0) return new Uint8Array();
  let res;
  if (strLength > 1024 && !isDeno2) {
    const byteLength = Buffer.byteLength(str);
    res = format === "buffer" ? Buffer.allocUnsafe(byteLength) : Buffer.allocUnsafeSlow(byteLength);
    const written = byteLength === strLength ? res.latin1Write(str) : res.utf8Write(str);
    if (written !== byteLength) throw new Error("Failed to write all bytes");
  } else {
    res = Buffer.from(str);
  }
  if (!loose && res.length !== strLength && !isWellFormed.call(str)) {
    throw new TypeError(E_STRICT_UNICODE);
  }
  return fromBuffer(res, format);
}
var utf8fromStringLoose = (str, format = "uint8") => encode(str, true, format);

// ../../node_modules/.pnpm/@exodus+bytes@1.15.1/node_modules/@exodus/bytes/fallback/single-byte.encodings.js
var r = 65533;
var i2 = [189, 148, 0, 0, 63, 0, 116, 64, 0, 68, 0, 78, 0, 78, 0, 0, 63, 64, 114, 117, 0, 0, 123, 0, 0, 128, 149, 0, 149, 0, 0, 132, 0, 117, 0, 0, 32, 0, 85, 33, 0, 37, 0, 47, 0, 47, 0, 0, 32, 33, 83, 86, 0, 0, 92, 0, 0, 97, 118, 0, 118, 0, 0, 101, 474];
var iB = [[58, 3424], [4, r], [29, 3424], [4, r]];
var i9 = [[47], 78, [12], 83, 128, [17], 47, [12], 52, 97];
var w1 = [8236, 0, 8088, 0, 8090, 8097, 8090, 8090, 0, 8103];
var w2 = [8236, 0, 8088, 271, 8090, 8097, 8090, 8090, 574, 8103];
var w7 = [64, 0, 157, [4], 39, 68, 109, 62, 67, 0, 0, 82, 75, 68, 0, 175, 75, 86, 105, 92, 108, 144, 114, 115, 0, 120, [3], 154, 104, 128, 143, 0, 158, 159, 0, 37, 78, 31, 36, 0, 0, 51, 44, 37, 0, 144, 44, 55, 74, 61, 77, 113, 83, 84, 0, 89, [3], 123, 73, 97, 112, 0, 127, 128];
var w8 = [8071, 8071, 8073, 8073, 8077, 8061, 8061];
var k8b = [-22, 910, 879, 879, 899, 880, 880, 894, 876, 893, [8, 879], 894, [4, 878], 864, 859, 884, 882, 861, 877, 881, 876, 873, 875, 846, 815, 815, 835, 816, 816, 830, 812, 829, [8, 815], 830, [4, 814], 800, 795, 820, 818, 797, 813, 817, 812, 809, 811];
var k8a = [9344, 9345, 9354, 9357, 9360, 9363, 9366, 9373, 9380, 9387, 9394, 9461, 9464, 9467, 9470, [4, 9473], 8845, 9484, 8580, 8580, 8625, 8652, 8652, 6, 8838, 20, 21, 25, 88, [3, 9392], 942];
var maps = {
  ibm866: [[48, 912], [3, 9441], ...[29, 62, 122, 122, 109, 107, 120, 101, 106, 111, 109, 107, 31, 34, 65, 56, 39, 10, 69, 102, 102, 96, 89, 109, 105, 98, 81, 108, 102, 102, 97, 97, 84, 82, 75, 75, 98, 96, 13, 0, 123, 118, 125, 128, 111].map((x) => x + 9266), [16, 864], 785, 864, 786, 865, 787, 866, 792, 871, -72, 8480, -67, 8479, 8218, -89, 9378, -95],
  "koi8-u": [...k8a, 944, 9391, 944, 944, [5, 9391], 996, 944, [4, 9391], 846, 848, 9390, 848, 848, [5, 9390], 979, 848, ...k8b],
  "koi8-r": [...k8a, [15, 9391], 846, [11, 9390], ...k8b],
  macintosh: [68, 68, 69, 70, 77, 81, 86, 90, 88, 89, 90, 88, 89, 90, 91, 89, 90, 90, 91, 89, 90, 90, 91, 92, 90, 91, 92, 90, 94, 92, 93, 93, 8064, 15, 0, 0, 3, 8061, 16, 56, 6, 0, 8312, 9, -4, 8627, 24, 41, 8558, 0, 8626, 8626, -15, 0, 8524, 8538, 8535, 775, 8561, -17, -2, 748, 40, 57, -1, -32, -22, 8535, 206, 8579, 8512, -28, -13, 8029, -42, -11, -9, 8, 132, 132, 8003, 8003, 8010, 8010, 8004, 8004, 33, 9459, 39, 159, 8042, 8145, 8029, 8029, 64035, 64035, 8001, -42, 7992, 7995, 8012, -35, -28, -38, -29, -33, [3, -29], -33, -27, -27, 63503, -31, -24, -24, -27, 60, 464, 485, -73, [3, 479], -68, 480, 477, 456],
  "x-mac-cyrillic": [[32, 912], 8064, 15, 1006, 0, 3, 8061, 16, 863, 6, 0, 8312, 855, 934, 8627, 853, 932, 8558, 0, 8626, 8626, 930, 0, 987, 849, 844, 923, 845, 924, 845, 924, 844, 923, 920, 836, -22, 8535, 206, 8579, 8512, -28, -13, 8029, -42, 832, 911, 831, 910, 902, 8003, 8003, 8010, 8010, 8004, 8004, 33, 8007, 822, 901, 821, 900, 8250, 804, 883, 880, [31, 848], 8109],
  "windows-874": [8236, [4], 8097, [11], ...w8, [9], ...iB]
};
[
  [...w1, 214, 8110, 206, 215, 239, 234, 0, ...w8, 0, 8329, 199, 8095, 191, 200, 224, 219, 0, 550, 566, 158, 0, 95, [4], 180, [4], 204, 0, 0, 553, 143, [5], 76, 165, 0, 129, 544, 128, ...i2],
  [898, 898, 8088, 976, 8090, 8097, 8090, 8090, 8228, 8103, 895, 8110, 894, 895, 893, 896, 962, ...w8, 0, 8329, 959, 8095, 958, 959, 957, 960, 0, 877, 956, 869, 0, 1003, 0, 0, 857, 0, 858, [4], 856, 0, 0, 852, 931, 989, [3], 921, 8285, 922, 0, 924, 840, 919, 920, [64, 848]],
  [...w2, 214, 8110, 198, 0, 239, 0, 0, ...w8, 580, 8329, 199, 8095, 183, 0, 224, 217],
  [8236, 0, 8088, 271, 8090, 8097, 8090, 8090, 0, 8103, 0, 8110, [5], ...w8, 0, 8329, 0, 8095, [5], 740, 740, [7], r, [4], 8038, [4], 720, [3], [3, 720], 0, 720, 0, [20, 720], r, [44, 720], r],
  [...w2, 214, 8110, 198, [4], ...w8, 580, 8329, 199, 8095, 183, 0, 0, 217, 0, ...i9],
  [...w2, 0, 8110, [5], ...w8, 580, 8329, 0, 8095, [8], 8198, [5], 45, [15], 61, [5], [20, 1264], [5, 1308], [7, r], [27, 1264], r, r, 7953, 7953, r],
  [8236, 1533, 8088, 271, 8090, 8097, 8090, 8090, 574, 8103, 1519, 8110, 198, 1529, 1546, 1529, 1567, ...w8, 1553, 8329, 1527, 8095, 183, 8047, 8047, 1563, 0, 1387, [8], 1556, [15], 1377, [4], 1376, 1537, [22, 1376], 0, [4, 1375], [4, 1380], 0, 1379, 0, [4, 1378], [5], 1373, 1373, 0, 0, [4, 1371], 0, 1370, 1370, 0, 1369, 0, 1368, 0, 0, 7953, 7953, 1491],
  [...w1, 0, 8110, 0, 27, 569, 41, 0, ...w8, 0, 8329, 0, 8095, 0, 18, 573, 0, 0, r, [3], r, 0, 0, 48, 0, 172, [4], 23, [8], ...w7, 474],
  [...w2, 0, 8110, 198, [4], ...w8, 580, 8329, 0, 8095, 183, 0, 0, 217, [35], 63, [8], 564, [3], 64, 0, 567, 0, 0, 203, [7], 210, 549, [4], 32, [8], 533, [3], 33, 0, 561, 0, 0, 172, [7], 179, 8109]
].forEach((m, i) => {
  maps[`windows-${i + 1250}`] = m;
});
[
  [],
  // Actual Latin1 / Unicode subset, non-WHATWG, which maps iso-8859-1 to windows-1252
  [99, 566, 158, 0, 152, 180, 0, 0, 183, 180, 185, 205, 0, 207, 204, 0, 84, 553, 143, 0, 137, 165, 528, 0, 168, 165, 170, 190, 544, 192, ...i2],
  [133, 566, 0, 0, r, 126, 0, 0, 135, 180, 115, 136, 0, r, 204, 0, 118, [4], 111, 0, 0, 120, 165, 100, 121, 0, r, 189, [3], r, 0, 69, 66, [9], r, [4], 75, 0, 0, 68, [4], 143, 126, [4], r, 0, 38, 35, [9], r, [4], 44, 0, 0, 37, [4], 112, 95, 474],
  [99, 150, 179, 0, 131, 149, 0, 0, 183, 104, 119, 186, 0, 207, 0, 0, 84, 553, 164, 0, 116, 134, 528, 0, 168, 89, 104, 171, 141, 192, 140, 64, [6], 103, 68, 0, 78, 0, 74, 0, 0, 91, 64, 116, 122, 99, [5], 153, [3], 139, 140, 0, 33, [6], 72, 37, 0, 47, 0, 43, 0, 0, 60, 33, 85, 91, 68, [5], 122, [3], 108, 109, 474],
  [[12, 864], 0, [66, 864], 8230, [12, 864], -86, 864, 864],
  [[3, r], 0, [7, r], 1376, 0, [13, r], 1376, [3, r], 1376, r, [26, 1376], [5, r], [19, 1376], [13, r]],
  [8055, 8055, 0, 8200, 8202, [4], 720, [3], r, 8038, [4], [3, 720], 0, [3, 720], 0, 720, 0, [20, 720], r, [44, 720], r],
  [r, [8], 45, [15], 61, [4], [32, r], 7992, [27, 1264], r, r, 7953, 7953, r],
  i9,
  // non-WHATWG, which maps iso-8859-9 to windows-1254
  [99, 112, 127, 134, 131, 144, 0, 147, 103, 182, 187, 209, 0, 188, 155, 0, 84, 97, 112, 119, 116, 129, 0, 132, 88, 167, 172, 194, 8024, 173, 140, 64, [6], 103, 68, 0, 78, 0, 74, [4], 116, 122, [4], 145, 0, 153, [6], 33, [6], 72, 37, 0, 47, 0, 43, [4], 85, 91, [4], 114, 0, 122, [5], 57],
  iB,
  // non-WHATWG, which maps iso-8859-11 to windows-874
  null,
  // no 12
  [8060, [3], 8057, 0, 0, 48, 0, 172, [4], 23, [4], 8040, [3], ...w7, 7962],
  [7521, 7521, 0, 102, 102, 7524, 0, 7640, 0, 7640, 7520, 7750, 0, 0, 201, 7534, 7534, 110, 110, 7564, 7564, 0, 7583, 7625, 7582, 7625, 7589, 7735, 7623, 7623, 7586, [16], 164, [6], 7571, [6], 152, [17], 133, [6], 7540, [6], 121],
  [[3], 8200, 0, 186, 0, 185, [11], 201, [3], 198, [3], 150, 150, 186],
  [99, 99, 158, 8200, 8057, 186, 0, 185, 0, 366, 0, 205, 0, 204, 204, 0, 0, 90, 143, 201, 8040, 0, 0, 198, 84, 351, 0, 150, 150, 186, 189, [3], 63, 0, 65, [10], 64, 114, [3], 123, 0, 131, 152, [4], 59, 316, [4], 32, 0, 34, [10], 33, 83, [3], 92, 0, 100, 121, [4], 28, 285]
].forEach((m, i) => {
  if (m) maps[`iso-8859-${i + 1}`] = [[33], ...m];
});
var single_byte_encodings_default = maps;

// ../../node_modules/.pnpm/@exodus+bytes@1.15.1/node_modules/@exodus/bytes/fallback/single-byte.js
var E_STRICT = "Input is not well-formed for this encoding";
var xUserDefined = "x-user-defined";
var iso8i = "iso-8859-8-i";
var assertEncoding = (encoding) => {
  if (Object.hasOwn(single_byte_encodings_default, encoding) || encoding === xUserDefined || encoding === iso8i) return;
  throw new RangeError("Unsupported encoding");
};
var r2 = 65533;
function getEncoding(encoding) {
  assertEncoding(encoding);
  if (encoding === xUserDefined) return Array.from({ length: 128 }, (_, i) => 63360 + i);
  if (encoding === iso8i) encoding = "iso-8859-8";
  const enc = single_byte_encodings_default[encoding];
  const deltas = enc.flatMap((x) => Array.isArray(x) ? new Array(x[0]).fill(x[1] ?? 0) : x);
  return deltas.map((x, i) => x === r2 ? x : x + 128 + i);
}
var encmaps = /* @__PURE__ */ new Map();
function encodeMap(encoding) {
  const cached = encmaps.get(encoding);
  if (cached) return cached;
  const codes = getEncoding(encoding);
  let max = 128;
  while (codes.length < 128) codes.push(128 + codes.length);
  for (const code of codes) if (code > max && code !== r2) max = code;
  const map = new Uint8Array(max + 1);
  for (let i = 0; i < 128; i++) {
    map[i] = i;
    if (codes[i] !== r2) map[codes[i]] = 128 + i;
  }
  encmaps.set(encoding, map);
  return map;
}

// ../../node_modules/.pnpm/@exodus+bytes@1.15.1/node_modules/@exodus/bytes/single-byte.node.js
var NON_LATIN = /[^\x00-\xFF]/;
function encode2(s, m) {
  const len = s.length;
  let i = 0;
  const b = Buffer.from(s, "utf-16le");
  if (!isLE) b.swap16();
  const x = new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2);
  for (const len3 = len - 3; i < len3; i += 4) {
    const x0 = x[i], x1 = x[i + 1], x2 = x[i + 2], x3 = x[i + 3];
    const c0 = m[x0], c1 = m[x1], c2 = m[x2], c3 = m[x3];
    if (!(c0 && c1 && c2 && c3) && (!c0 && x0 || !c1 && x1 || !c2 && x2 || !c3 && x3)) return null;
    x[i] = c0;
    x[i + 1] = c1;
    x[i + 2] = c2;
    x[i + 3] = c3;
  }
  for (; i < len; i++) {
    const x0 = x[i];
    const c0 = m[x0];
    if (!c0 && x0) return null;
    x[i] = c0;
  }
  return new Uint8Array(x);
}
function latin1fromString(s) {
  if (typeof s !== "string") throw new TypeError(E_STRING);
  if (NON_LATIN.test(s)) throw new TypeError(E_STRICT);
  const ab = new ArrayBuffer(s.length);
  Buffer.from(ab).latin1Write(s);
  return new Uint8Array(ab);
}
function createSinglebyteEncoder(encoding, { mode = "fatal" } = {}) {
  if (mode !== "fatal") throw new Error("Unsupported mode");
  if (encoding === "iso-8859-1") return latin1fromString;
  const m = encodeMap(encoding);
  return (s) => {
    if (typeof s !== "string") throw new TypeError(E_STRING);
    if (!NON_LATIN.test(s)) {
      const byteLength = Buffer.byteLength(s);
      if (byteLength === s.length) {
        const ab = new ArrayBuffer(byteLength);
        Buffer.from(ab).latin1Write(s);
        return new Uint8Array(ab);
      }
    }
    const res = encode2(s, m);
    if (!res) throw new TypeError(E_STRICT);
    return res;
  };
}

// ../../node_modules/.pnpm/@exodus+bytes@1.15.1/node_modules/@exodus/bytes/fallback/encoding.labels.js
var labels = {
  "utf-8": ["unicode-1-1-utf-8", "unicode11utf8", "unicode20utf8", "utf8", "x-unicode20utf8"],
  "utf-16be": ["unicodefffe"],
  "utf-16le": ["csunicode", "iso-10646-ucs-2", "ucs-2", "unicode", "unicodefeff", "utf-16"],
  "iso-8859-2": ["iso-ir-101"],
  "iso-8859-3": ["iso-ir-109"],
  "iso-8859-4": ["iso-ir-110"],
  "iso-8859-5": ["csisolatincyrillic", "cyrillic", "iso-ir-144"],
  "iso-8859-6": ["arabic", "asmo-708", "csiso88596e", "csiso88596i", "csisolatinarabic", "ecma-114", "iso-8859-6-e", "iso-8859-6-i", "iso-ir-127"],
  "iso-8859-7": ["csisolatingreek", "ecma-118", "elot_928", "greek", "greek8", "iso-ir-126", "sun_eu_greek"],
  "iso-8859-8": ["csiso88598e", "csisolatinhebrew", "hebrew", "iso-8859-8-e", "iso-ir-138", "visual"],
  "iso-8859-8-i": ["csiso88598i", "logical"],
  "iso-8859-16": [],
  "koi8-r": ["cskoi8r", "koi", "koi8", "koi8_r"],
  "koi8-u": ["koi8-ru"],
  "windows-874": ["dos-874", "iso-8859-11", "iso8859-11", "iso885911", "tis-620"],
  ibm866: ["866", "cp866", "csibm866"],
  "x-mac-cyrillic": ["x-mac-ukrainian"],
  macintosh: ["csmacintosh", "mac", "x-mac-roman"],
  gbk: ["chinese", "csgb2312", "csiso58gb231280", "gb2312", "gb_2312", "gb_2312-80", "iso-ir-58", "x-gbk"],
  gb18030: [],
  big5: ["big5-hkscs", "cn-big5", "csbig5", "x-x-big5"],
  "euc-jp": ["cseucpkdfmtjapanese", "x-euc-jp"],
  shift_jis: ["csshiftjis", "ms932", "ms_kanji", "shift-jis", "sjis", "windows-31j", "x-sjis"],
  "euc-kr": ["cseuckr", "csksc56011987", "iso-ir-149", "korean", "ks_c_5601-1987", "ks_c_5601-1989", "ksc5601", "ksc_5601", "windows-949"],
  "iso-2022-jp": ["csiso2022jp"],
  replacement: ["csiso2022kr", "hz-gb-2312", "iso-2022-cn", "iso-2022-cn-ext", "iso-2022-kr"],
  "x-user-defined": []
};
for (const i of [10, 13, 14, 15]) labels[`iso-8859-${i}`] = [`iso8859-${i}`, `iso8859${i}`];
for (const i of [2, 6, 7]) labels[`iso-8859-${i}`].push(`iso_8859-${i}:1987`);
for (const i of [3, 4, 5, 8]) labels[`iso-8859-${i}`].push(`iso_8859-${i}:1988`);
for (let i = 2; i < 9; i++) labels[`iso-8859-${i}`].push(`iso8859-${i}`, `iso8859${i}`, `iso_8859-${i}`);
for (let i = 2; i < 5; i++) labels[`iso-8859-${i}`].push(`csisolatin${i}`, `l${i}`, `latin${i}`);
for (let i = 0; i < 9; i++) labels[`windows-125${i}`] = [`cp125${i}`, `x-cp125${i}`];
labels["windows-1252"].push("ansi_x3.4-1968", "ascii", "cp819", "csisolatin1", "ibm819", "iso-8859-1", "iso-ir-100", "iso8859-1", "iso88591", "iso_8859-1", "iso_8859-1:1987", "l1", "latin1", "us-ascii");
labels["windows-1254"].push("csisolatin5", "iso-8859-9", "iso-ir-148", "iso8859-9", "iso88599", "iso_8859-9", "iso_8859-9:1989", "l5", "latin5");
labels["iso-8859-10"].push("csisolatin6", "iso-ir-157", "l6", "latin6");
labels["iso-8859-15"].push("csisolatin9", "iso_8859-15", "l9");
var encoding_labels_default = labels;

// ../../node_modules/.pnpm/@exodus+bytes@1.15.1/node_modules/@exodus/bytes/fallback/encoding.js
var E_ENCODING = "Unknown encoding";
var E_MULTI = "import '@exodus/bytes/encoding.js' for legacy multi-byte encodings support";
var multibyteSet = /* @__PURE__ */ new Set(["big5", "euc-kr", "euc-jp", "iso-2022-jp", "shift_jis", "gbk", "gb18030"]);
var multibyteEncoder;
var labelsMap;
function normalizeEncoding(label) {
  if (label === "utf-8" || label === "utf8" || label === "UTF-8" || label === "UTF8") return "utf-8";
  if (label === "windows-1252" || label === "ascii" || label === "latin1") return "windows-1252";
  if (/[^\w\t\n\f\r .:-]/i.test(label)) return null;
  const low = `${label}`.trim().toLowerCase();
  if (Object.hasOwn(encoding_labels_default, low)) return low;
  if (!labelsMap) {
    labelsMap = /* @__PURE__ */ new Map();
    for (const [name, aliases] of Object.entries(encoding_labels_default)) {
      for (const alias of aliases) labelsMap.set(alias, name);
    }
  }
  const mapped = labelsMap.get(low);
  if (mapped) return mapped;
  return null;
}
var isMultibyte = (enc) => multibyteSet.has(enc);
function getMultibyteEncoder() {
  if (!multibyteEncoder) throw new Error(E_MULTI);
  return multibyteEncoder;
}

// ../../node_modules/.pnpm/@exodus+bytes@1.15.1/node_modules/@exodus/bytes/fallback/percent.js
var ERR = "percentEncodeSet must be a string of unique increasing codepoints in range 0x20 - 0x7e";
var percentMap = /* @__PURE__ */ new Map();
var hex;
var base;
function percentEncoder(set, spaceAsPlus = false) {
  if (typeof set !== "string" || /[^\x20-\x7E]/.test(set)) throw new TypeError(ERR);
  if (typeof spaceAsPlus !== "boolean") throw new TypeError("spaceAsPlus must be boolean");
  const id = set + +spaceAsPlus;
  const cached = percentMap.get(id);
  if (cached) return cached;
  const n = encodeLatin1(set).sort();
  if (decodeAscii(n) !== set || new Set(n).size !== n.length) throw new TypeError(ERR);
  if (!base) {
    hex = Array.from({ length: 256 }, (_, i) => `%${i.toString(16).padStart(2, "0").toUpperCase()}`);
    base = hex.map((h, i) => i < 32 || i > 126 ? h : String.fromCharCode(i));
  }
  const map = base.slice();
  for (const c of n) map[c] = hex[c];
  if (spaceAsPlus) map[32] = "+";
  const percentEncode = (u8, start = 0, end = u8.length) => decode2string(u8, start, end, map);
  percentMap.set(id, percentEncode);
  return percentEncode;
}

// ../../node_modules/.pnpm/@exodus+bytes@1.15.1/node_modules/@exodus/bytes/whatwg.js
function percentEncodeAfterEncoding(encoding, input, percentEncodeSet, spaceAsPlus = false) {
  const enc = normalizeEncoding(encoding);
  if (!enc || enc === "replacement" || enc === "utf-16le" || enc === "utf-16be") {
    throw new RangeError(E_ENCODING);
  }
  const percent = percentEncoder(percentEncodeSet, spaceAsPlus);
  if (enc === "utf-8") return percent(utf8fromStringLoose(input));
  const multi = isMultibyte(enc);
  const encoder = multi ? getMultibyteEncoder() : createSinglebyteEncoder;
  const fatal = encoder(enc);
  try {
    return percent(fatal(input));
  } catch {
  }
  let res = "";
  let last = 0;
  if (multi) {
    const rep = enc === "gb18030" ? percent(fatal("\uFFFD")) : `%26%23${65533}%3B`;
    const escaping = encoder(enc, (cp, u2, i) => {
      res += percent(u2, last, i);
      res += cp >= 55296 && cp < 57344 ? rep : `%26%23${cp}%3B`;
      last = i;
      return 0;
    });
    const u = escaping(input);
    res += percent(u, last);
  } else {
    if (typeof input !== "string") throw new TypeError(E_STRING);
    const m = encodeMap(enc);
    const len = input.length;
    const u = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      const x = input.charCodeAt(i);
      const b = m[x];
      if (!b && x) {
        let cp = x;
        const i0 = i;
        if (x >= 55296 && x < 57344) {
          cp = 65533;
          if (x < 56320 && i + 1 < len) {
            const x1 = input.charCodeAt(i + 1);
            if (x1 >= 56320 && x1 < 57344) {
              cp = 65536 + (x1 & 1023 | (x & 1023) << 10);
              i++;
            }
          }
        }
        res += `${percent(u, last, i0)}%26%23${cp}%3B`;
        last = i + 1;
      } else {
        u[i] = b;
      }
    }
    res += percent(u, last);
  }
  return res;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  percentEncodeAfterEncoding
});
