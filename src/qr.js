/* Small offline QR encoder for version 5-L pairing URLs. */
(() => {
  const SIZE = 37, DATA_CODEWORDS = 108, ECC_CODEWORDS = 26;
  function gfMultiply(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function reedSolomon(data) {
    let generator = [1];
    for (let i = 0, root = 1; i < ECC_CODEWORDS; i++) {
      const next = new Array(generator.length + 1).fill(0);
      generator.forEach((value, index) => { next[index] ^= value; next[index + 1] ^= gfMultiply(value, root); });
      generator = next; root = gfMultiply(root, 2);
    }
    const work = [...data, ...new Array(ECC_CODEWORDS).fill(0)];
    for (let i = 0; i < data.length; i++) {
      const factor = work[i];
      if (factor) generator.forEach((coefficient, index) => { work[i + index] ^= gfMultiply(coefficient, factor); });
    }
    return work.slice(data.length);
  }
  function makeQrMatrix(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    if (bytes.length > 106) throw new Error('Pairing link is too long for QR.');
    const bits = [];
    const append = (value, count) => { for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
    append(4, 4); append(bytes.length, 8); bytes.forEach(byte => append(byte, 8));
    for (let i = 0; i < Math.min(4, DATA_CODEWORDS * 8 - bits.length); i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0));
    for (let pad = 0; data.length < DATA_CODEWORDS; pad++) data.push(pad % 2 ? 0x11 : 0xec);
    const codewords = [...data, ...reedSolomon(data)];
    const grid = Array.from({ length:SIZE }, () => new Array(SIZE).fill(null));
    const setFunction = (x, y, dark) => { if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) grid[y][x] = Boolean(dark); };
    function finder(cx, cy) {
      for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
        const x = cx + dx, y = cy + dy;
        const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        const dark = inside && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        setFunction(x, y, dark);
      }
    }
    finder(0, 0); finder(SIZE - 7, 0); finder(0, SIZE - 7);
    for (let i = 8; i < SIZE - 8; i++) { setFunction(6, i, i % 2 === 0); setFunction(i, 6, i % 2 === 0); }
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFunction(30 + dx, 30 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    // Reserve the format-information cells before placing data.
    for (let i = 0; i <= 5; i++) setFunction(8, i, false);
    setFunction(8, 7, false); setFunction(8, 8, false); setFunction(7, 8, false);
    for (let i = 9; i < 15; i++) setFunction(14 - i, 8, false);
    for (let i = 0; i < 8; i++) setFunction(SIZE - 1 - i, 8, false);
    for (let i = 8; i < 15; i++) setFunction(8, SIZE - 15 + i, false);
    setFunction(8, SIZE - 8, true);
    let bitIndex = 0;
    for (let right = SIZE - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < SIZE; vert++) {
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? SIZE - 1 - vert : vert;
        for (let offset = 0; offset < 2; offset++) {
          const x = right - offset;
          if (grid[y][x] !== null) continue;
          const dark = bitIndex < codewords.length * 8 && ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
          grid[y][x] = dark !== ((x + y) % 2 === 0); // Mask 0.
          bitIndex++;
        }
      }
    }
    const formatData = 8; // Error correction L, mask 0.
    let remainder = formatData << 10;
    for (let bit = 14; bit >= 10; bit--) if ((remainder >>> bit) & 1) remainder ^= 0x537 << (bit - 10);
    const format = ((formatData << 10) | remainder) ^ 0x5412;
    const formatBit = i => ((format >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) setFunction(8, i, formatBit(i));
    setFunction(8, 7, formatBit(6)); setFunction(8, 8, formatBit(7)); setFunction(7, 8, formatBit(8));
    for (let i = 9; i < 15; i++) setFunction(14 - i, 8, formatBit(i));
    for (let i = 0; i < 8; i++) setFunction(SIZE - 1 - i, 8, formatBit(i));
    for (let i = 8; i < 15; i++) setFunction(8, SIZE - 15 + i, formatBit(i));
    setFunction(8, SIZE - 8, true);
    return grid;
  }
  function drawQr(canvas, text) {
    const matrix = makeQrMatrix(text), context = canvas.getContext('2d');
    const quiet = 4, total = SIZE + quiet * 2, cell = Math.floor(canvas.width / total), offset = Math.floor((canvas.width - cell * total) / 2);
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#13243b';
    matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) context.fillRect(offset + (x + quiet) * cell, offset + (y + quiet) * cell, cell, cell); }));
  }
  window.makeQrMatrix = makeQrMatrix;
  window.drawQr = drawQr;
})();
