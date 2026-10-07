from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


DOCS_DIR = Path(__file__).parent
OUTPUT_PATH = DOCS_DIR / "chapter3_current_process_flowchart.png"

BLACK = "#111111"
WHITE = "#ffffff"


def font_path(name: str) -> str | None:
    candidates = {
        "regular": [r"C:\Windows\Fonts\arial.ttf", r"C:\Windows\Fonts\Arial.ttf"],
        "bold": [r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\Arialbd.ttf"],
    }
    for candidate in candidates[name]:
        path = Path(candidate)
        if path.exists():
            return str(path)
    return None


def load_font(size: int, kind: str = "regular") -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = font_path(kind)
    if path:
        return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


FONT = load_font(24)
FONT_SMALL = load_font(21)
FONT_BOLD = load_font(24, "bold")
FONT_LABEL = load_font(20)


def text_size(draw: ImageDraw.ImageDraw, text: str, font) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
        if not words:
            lines.append("")
            continue
        current = words[0]
        for word in words[1:]:
            trial = f"{current} {word}"
            width, _ = text_size(draw, trial, font)
            if width <= max_width:
                current = trial
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines


def draw_centered_text(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    text: str,
    font,
    *,
    line_gap: int = 5,
) -> None:
    x1, y1, x2, y2 = box
    lines = wrap_text(draw, text, font, x2 - x1 - 24)
    heights = [text_size(draw, line, font)[1] for line in lines]
    total_height = sum(heights) + max(0, len(lines) - 1) * line_gap
    y = y1 + ((y2 - y1) - total_height) // 2
    for line, height in zip(lines, heights):
        width, _ = text_size(draw, line, font)
        draw.text((x1 + ((x2 - x1) - width) // 2, y), line, font=font, fill=BLACK)
        y += height + line_gap


def draw_box(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str) -> None:
    draw.rectangle(box, fill=WHITE, outline=BLACK, width=3)
    draw_centered_text(draw, box, text, FONT_SMALL)


def draw_oval(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str) -> None:
    draw.ellipse(box, fill=WHITE, outline=BLACK, width=3)
    draw_centered_text(draw, box, text, FONT_BOLD)


def draw_diamond(draw: ImageDraw.ImageDraw, center: tuple[int, int], width: int, height: int, text: str) -> tuple[int, int, int, int]:
    cx, cy = center
    points = [(cx, cy - height // 2), (cx + width // 2, cy), (cx, cy + height // 2), (cx - width // 2, cy)]
    draw.polygon(points, fill=WHITE, outline=BLACK)
    draw.line(points + [points[0]], fill=BLACK, width=3)
    box = (cx - width // 2 + 8, cy - height // 2 + 8, cx + width // 2 - 8, cy + height // 2 - 8)
    draw_centered_text(draw, box, text, FONT_SMALL, line_gap=3)
    return (cx - width // 2, cy - height // 2, cx + width // 2, cy + height // 2)


def arrow_head(draw: ImageDraw.ImageDraw, tip: tuple[int, int], direction: str, size: int = 14) -> None:
    x, y = tip
    if direction == "down":
        points = [(x, y), (x - size // 2, y - size), (x + size // 2, y - size)]
    elif direction == "up":
        points = [(x, y), (x - size // 2, y + size), (x + size // 2, y + size)]
    elif direction == "right":
        points = [(x, y), (x - size, y - size // 2), (x - size, y + size // 2)]
    else:
        points = [(x, y), (x + size, y - size // 2), (x + size, y + size // 2)]
    draw.polygon(points, fill=BLACK)


def draw_arrow(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[int, int]],
    direction: str,
    *,
    label: str | None = None,
    label_at: tuple[int, int] | None = None,
) -> None:
    draw.line(points, fill=BLACK, width=3)
    arrow_head(draw, points[-1], direction)
    if label and label_at:
        draw.text(label_at, label, font=FONT_LABEL, fill=BLACK)


def main() -> None:
    image = Image.new("RGB", (1250, 2200), WHITE)
    draw = ImageDraw.Draw(image)

    x_main = 235
    w_main = 310
    h_box = 92
    cx_main = x_main + w_main // 2

    start = (250, 45, 530, 135)
    queue = (x_main, 210, x_main + w_main, 210 + h_box)
    preorder = (x_main, 365, x_main + w_main, 365 + h_box)
    counter = (x_main, 520, x_main + w_main, 520 + h_box)
    input_order = (x_main, 675, x_main + w_main, 675 + h_box)
    stock = draw_diamond(draw, (cx_main, 890), 230, 150, "Are ingredients in stock?")
    change_order = (710, 825, 1095, 925)
    payment = draw_diamond(draw, (cx_main, 1095), 230, 150, "Payment Method?")
    cash_delay = (75, 1260, 390, 1368)
    gcash = (500, 1260, 850, 1368)
    loyalty = (x_main, 1448, x_main + w_main, 1556)
    ticket = (x_main, 1636, x_main + w_main, 1728)
    prep = (x_main, 1805, x_main + w_main, 1905)
    errors = draw_diamond(draw, (cx_main, 2040), 250, 150, "Manual errors or missed notes?")
    fix_error = (720, 1985, 1110, 2095)
    end = (265, 2130, 515, 2190)

    draw_oval(draw, start, "START")
    draw_box(draw, queue, "Customer joins physical queue")
    draw_box(draw, preorder, "Staff takes manual order while customer is in line")
    draw_box(draw, counter, "Customer reaches POS counter")
    draw_box(draw, input_order, "Staff inputs order into disorganized POS")
    draw_box(draw, change_order, "Customer changes order due to unavailable ingredients")
    draw_box(draw, cash_delay, "Cash payment delays due to lack of exact change")
    draw_box(draw, gcash, "GCash payment requires manual screenshot verification")
    draw_box(draw, loyalty, "Physical loyalty card is stamped manually")
    draw_box(draw, ticket, "Order ticket is generated")
    draw_box(draw, prep, "Preparation phase wait time: 10 to 30 minutes")
    draw_box(draw, fix_error, "Order mix-ups are corrected or clarified")
    draw_oval(draw, end, "END")

    draw_arrow(draw, [(390, 135), (390, 210)], "down")
    draw_arrow(draw, [(cx_main, 302), (cx_main, 365)], "down")
    draw_arrow(draw, [(cx_main, 457), (cx_main, 520)], "down")
    draw_arrow(draw, [(cx_main, 612), (cx_main, 675)], "down")
    draw_arrow(draw, [(cx_main, 767), (cx_main, 815)], "down")
    draw_arrow(draw, [(545, 890), (710, 890)], "right", label="No", label_at=(590, 858))
    draw_arrow(draw, [(902, 825), (902, 720), (545, 720)], "left")
    draw_arrow(draw, [(cx_main, 965), (cx_main, 1020)], "down", label="Yes", label_at=(410, 980))
    draw_arrow(draw, [(285, 1095), (235, 1095), (235, 1260)], "down", label="Cash", label_at=(116, 1110))
    draw_arrow(draw, [(500, 1095), (675, 1095), (675, 1260)], "down", label="GCash", label_at=(694, 1110))
    draw_arrow(draw, [(390, 1315), (455, 1315), (455, 1448)], "down")
    draw_arrow(draw, [(675, 1368), (675, 1495), (545, 1495)], "left")
    draw_arrow(draw, [(cx_main, 1556), (cx_main, 1636)], "down")
    draw_arrow(draw, [(cx_main, 1728), (cx_main, 1805)], "down")
    draw_arrow(draw, [(cx_main, 1905), (cx_main, 1965)], "down")
    draw_arrow(draw, [(545, 2040), (720, 2040)], "right", label="Yes", label_at=(595, 2008))
    draw_arrow(draw, [(915, 2095), (915, 2160), (515, 2160)], "left")
    draw_arrow(draw, [(cx_main, 2115), (cx_main, 2130)], "down", label="No", label_at=(415, 2100))

    image.save(OUTPUT_PATH)
    print(f"WROTE={OUTPUT_PATH}")


if __name__ == "__main__":
    main()
