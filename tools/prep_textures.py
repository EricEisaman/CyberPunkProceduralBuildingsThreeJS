"""Prepare the "Improved textures" sets for the web.

Every texture here is CC0 (public domain): free for commercial use, no
attribution required. Sources:
  ambientCG  https://ambientcg.com   set folders like Concrete036/ with *_Color.jpg, *_NormalGL.jpg, ...
  Poly Haven https://polyhaven.com   folders <id>/ with color.jpg, normal.jpg (OpenGL), rough.jpg (1k)

Writes, per set, public/tex/<id>/{color,normal,rough}.jpg (1024 / 512 / 256 px),
public/tex/leak/mask.jpg, public/tex/CREDITS.txt, and src/gen/texManifest.ts
(the families, each set's source and its average albedo for tinting).

  python tools/prep_textures.py <ambientCG folder> <Poly Haven folder>
"""
import glob
import os
import sys

from PIL import Image, ImageFilter, ImageStat

ACG = sys.argv[1] if len(sys.argv) > 1 else "../ProdceduralBuildingsThreeJS/blender/textures"
PH = sys.argv[2] if len(sys.argv) > 2 else None
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "public", "tex")

# family -> [(source, set name)]; the first set is the default look
FAMILIES = {
    "concrete": [("acg", "Concrete036"), ("acg", "Concrete034"), ("ph", "concrete_wall_008"), ("ph", "cracked_concrete_wall")],
    "plaster": [("acg", "Plaster003"), ("acg", "PaintedPlaster017"), ("ph", "white_rough_plaster")],
    "tiles": [("acg", "Tiles036"), ("acg", "Tiles138"), ("ph", "tiled_floor_001")],
    "bricks": [("acg", "Bricks101"), ("acg", "Bricks097")],
    "metalDark": [("acg", "Metal027"), ("acg", "Metal028"), ("ph", "metal_plate")],
    "brushed": [("acg", "Metal009"), ("acg", "Metal050C")],
    "rusty": [("acg", "Metal041B"), ("ph", "rusty_metal_02")],
    "painted": [("acg", "PaintedMetal012"), ("ph", "green_metal_rust")],
    "corrugated": [("acg", "CorrugatedSteel005"), ("ph", "corrugated_iron_02")],
    "road": [("acg", "Road012A"), ("acg", "Asphalt031"), ("ph", "asphalt_02")],
    "paving": [("acg", "PavingStones136"), ("ph", "large_grey_tiles")],
    "tactile": [("acg", "TactilePaving003")],
}


def acg_file(set_name, kind):
    hits = sorted(glob.glob(os.path.join(ACG, set_name, f"*{kind}.jpg")))
    hits.sort(key=lambda p: ("1K" not in p, p))
    return hits[0] if hits else None


def square(im, size):
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    return im.resize((size, size), Image.LANCZOS)


def normal_from_height(path, size, strength=3.0):
    h = square(Image.open(path).convert("L"), size).filter(ImageFilter.GaussianBlur(0.6))
    px = h.load()
    out = Image.new("RGB", (size, size))
    po = out.load()
    for y in range(size):
        for x in range(size):
            dx = (px[(x + 1) % size, y] - px[(x - 1) % size, y]) / 255.0 * strength
            dy = (px[x, (y + 1) % size] - px[x, (y - 1) % size]) / 255.0 * strength
            nx, ny, nz = -dx, dy, 1.0
            l = (nx * nx + ny * ny + nz * nz) ** 0.5
            po[x, y] = (int((nx / l * 0.5 + 0.5) * 255), int((ny / l * 0.5 + 0.5) * 255), int((nz / l * 0.5 + 0.5) * 255))
    return out


def avg_albedo(img):
    """mean linear luminance, so a material can be tinted back to its own brightness"""
    small = img.resize((64, 64))
    px = list(small.getdata())
    lin = lambda c: (c / 255.0) ** 2.2
    return sum(0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) for r, g, b in px) / len(px)


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    credits = []
    total = 0
    for fam, sets in FAMILIES.items():
        manifest[fam] = []
        for src, name in sets:
            vid = f"{fam}-{len(manifest[fam])}"
            d = os.path.join(OUT, vid)
            os.makedirs(d, exist_ok=True)
            if src == "acg":
                col, nrm, rgh, disp = (acg_file(name, k) for k in ("Color", "NormalGL", "Roughness", "Displacement"))
                url = f"https://ambientcg.com/view?id={name}"
            else:
                base = os.path.join(PH, name)
                col, nrm, rgh, disp = (os.path.join(base, f) for f in ("color.jpg", "normal.jpg", "rough.jpg", "_none_"))
                url = f"https://polyhaven.com/a/{name}"
            color = square(Image.open(col).convert("RGB"), 1024)
            color.save(os.path.join(d, "color.jpg"), quality=80, optimize=True, progressive=True)
            if nrm and os.path.exists(nrm):
                square(Image.open(nrm).convert("RGB"), 512).save(os.path.join(d, "normal.jpg"), quality=85, optimize=True)
            elif disp and os.path.exists(disp):
                normal_from_height(disp, 512).save(os.path.join(d, "normal.jpg"), quality=85, optimize=True)
            else:
                Image.new("RGB", (4, 4), (128, 128, 255)).save(os.path.join(d, "normal.jpg"))
            if rgh and os.path.exists(rgh):
                square(Image.open(rgh).convert("L"), 256).save(os.path.join(d, "rough.jpg"), quality=80, optimize=True)
            else:
                Image.new("L", (4, 4), 160).save(os.path.join(d, "rough.jpg"))
            avg = avg_albedo(color)
            size = sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d))
            total += size
            source = "ambientCG" if src == "acg" else "Poly Haven"
            manifest[fam].append({"id": vid, "name": name, "source": source, "avg": round(avg, 4)})
            credits.append(f"  {vid:14s} {source:10s} {name:24s} {url}")
            print(f"{vid:14s} <- {source:10s} {name:24s} {size / 1024:6.0f} KB  avg {avg:.3f}")

    # rain-streak grime mask (ambientCG Leaking006)
    leak = acg_file("Leaking006", "Opacity")
    d = os.path.join(OUT, "leak")
    os.makedirs(d, exist_ok=True)
    im = Image.open(leak).convert("L")
    im.thumbnail((256, 1024), Image.LANCZOS)
    canvas = Image.new("L", (256, 1024), 0)
    canvas.paste(im, ((256 - im.width) // 2, 0))
    canvas.save(os.path.join(d, "mask.jpg"), quality=82)
    total += os.path.getsize(os.path.join(d, "mask.jpg"))
    credits.append("  leak           ambientCG  Leaking006               https://ambientcg.com/view?id=Leaking006")

    with open(os.path.join(OUT, "CREDITS.txt"), "w", encoding="utf8") as f:
        f.write("Improved textures: every set is CC0 1.0 Universal (public domain).\n")
        f.write("Free for personal and commercial use, no attribution required.\n")
        f.write("ambientCG: https://ambientcg.com  ·  Poly Haven: https://polyhaven.com\n\n")
        f.write("\n".join(credits) + "\n")

    ts = ["// Generated by tools/prep_textures.py: the Improved-textures families. Do not edit.",
          "export interface TexVariant { id: string; name: string; source: \"ambientCG\" | \"Poly Haven\"; avg: number }",
          "export const TEX_FAMILIES = {"]
    for fam, vs in manifest.items():
        items = ", ".join("{ id: \"%s\", name: \"%s\", source: \"%s\", avg: %s }" % (v["id"], v["name"], v["source"], v["avg"]) for v in vs)
        ts.append(f"  {fam}: [{items}] as TexVariant[],")
    ts.append("};")
    ts.append("export type TexFamily = keyof typeof TEX_FAMILIES;")
    with open(os.path.join(ROOT, "src", "gen", "texManifest.ts"), "w", encoding="utf8") as f:
        f.write("\n".join(ts) + "\n")
    print(f"total {total / 1024 / 1024:.1f} MB in {sum(len(v) for v in manifest.values())} sets")


main()
