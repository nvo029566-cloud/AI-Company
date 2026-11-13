import test from "node:test";
import assert from "node:assert/strict";
import { DEPARTMENTS, AGENTS } from "../src/seed.js";
import { LAYOUT, GW, GD, RD, deskSpots } from "../public/js/office3d.js";

const sizeOf = (code) => AGENTS.filter((a) => a.dept === code).length;
const rooms = Object.entries(LAYOUT).map(([code, [x, row, w]]) => ({
  code,
  x,
  y: row * 8,
  w,
  d: RD,
}));

test("mọi phòng ban đều có chỗ trong văn phòng 3D, kèm phòng CEO", () => {
  for (const d of DEPARTMENTS)
    assert.ok(LAYOUT[d.code], `thiếu phòng ${d.code}`);
  assert.ok(LAYOUT.CEO);
  assert.equal(Object.keys(LAYOUT).length, DEPARTMENTS.length + 1);
});

test("các phòng nằm trong tòa nhà và không đè lên nhau (chừa lối đi)", () => {
  for (const r of rooms) {
    assert.ok(r.x >= 0 && r.x + r.w <= GW, `${r.code} vượt chiều ngang`);
    assert.ok(r.y >= 0 && r.y + r.d <= GD, `${r.code} vượt chiều sâu`);
  }
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i],
        b = rooms[j],
        gap = 1.5;
      const apart =
        a.x + a.w + gap <= b.x ||
        b.x + b.w + gap <= a.x ||
        a.y + a.d + gap <= b.y ||
        b.y + b.d + gap <= a.y;
      assert.ok(apart, `phòng ${a.code} và ${b.code} quá sát hoặc chồng nhau`);
    }
});

test("số bàn khớp đúng số người từng phòng, đúng một chỗ trưởng phòng", () => {
  for (const d of DEPARTMENTS) {
    const spots = deskSpots(sizeOf(d.code), LAYOUT[d.code][2]);
    assert.equal(spots.length, sizeOf(d.code), `phòng ${d.code}`);
    assert.equal(
      spots.filter((s) => s[2]).length,
      1,
      `phòng ${d.code} phải có đúng 1 trưởng phòng`,
    );
  }
  assert.equal(deskSpots(1, LAYOUT.CEO[2]).length, 1);
  assert.equal(
    DEPARTMENTS.reduce(
      (n, d) => n + deskSpots(sizeOf(d.code), LAYOUT[d.code][2]).length,
      0,
    ),
    26,
  );
});

test("bàn nằm trong phòng và không chồng lên bàn khác", () => {
  for (const [code, [, , w]] of Object.entries(LAYOUT)) {
    const n = code === "CEO" ? 1 : sizeOf(code);
    const spots = deskSpots(n, w);
    for (const [x, y] of spots) {
      assert.ok(
        x >= 0.9 && x <= w - 0.9,
        `phòng ${code}: bàn lệch ngang (${x})`,
      );
      assert.ok(
        y >= 1.2 && y <= RD - 0.9,
        `phòng ${code}: bàn lệch dọc (${y})`,
      );
    }
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++) {
        const dx = Math.abs(spots[i][0] - spots[j][0]),
          dy = Math.abs(spots[i][1] - spots[j][1]);
        // bàn rộng 1,6 và sâu 0,9 (cộng chỗ ngồi 0,75 phía sau): hai bàn cùng dãy phải cách ngang >= 1,7, khác dãy cách dọc >= 1,4
        assert.ok(
          dx >= 1.7 || dy >= 1.4,
          `phòng ${code}: bàn ${i} và ${j} chồng nhau (dx=${dx.toFixed(2)}, dy=${dy.toFixed(2)})`,
        );
      }
  }
});
