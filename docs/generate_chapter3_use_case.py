from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


DOCS_DIR = Path(__file__).parent
OUTPUT_PATH = DOCS_DIR / "chapter3_use_case_diagram.png"

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


FONT_TITLE = load_font(22)
FONT_ACTOR = load_font(20)
FONT_USE_CASE = load_font(20)
FONT_REL = load_font(16)


def text_size(draw: ImageDraw.ImageDraw, text: str, font) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
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


def centered_text(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str, font) -> None:
    x1, y1, x2, y2 = box
    lines = wrap_text(draw, text, font, x2 - x1 - 26)
    heights = [text_size(draw, line, font)[1] for line in lines]
    total_height = sum(heights) + max(0, len(lines) - 1) * 4
    y = y1 + ((y2 - y1) - total_height) // 2
    for line, height in zip(lines, heights):
        width, _ = text_size(draw, line, font)
        draw.text((x1 + ((x2 - x1) - width) // 2, y), line, font=font, fill=BLACK)
        y += height + 4


def ellipse_center(box: tuple[int, int, int, int]) -> tuple[int, int]:
    x1, y1, x2, y2 = box
    return (x1 + x2) // 2, (y1 + y2) // 2


def ellipse_anchor(box: tuple[int, int, int, int], target: tuple[int, int]) -> tuple[int, int]:
    cx, cy = ellipse_center(box)
    rx = (box[2] - box[0]) / 2
    ry = (box[3] - box[1]) / 2
    dx = target[0] - cx
    dy = target[1] - cy
    if dx == 0 and dy == 0:
        return cx, cy
    scale = 1 / math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry))
    return int(cx + dx * scale), int(cy + dy * scale)


def draw_use_case(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str) -> None:
    draw.ellipse(box, outline=BLACK, width=3, fill=WHITE)
    centered_text(draw, box, text, FONT_USE_CASE)


def draw_actor(draw: ImageDraw.ImageDraw, x: int, y: int, label: str) -> dict[str, tuple[int, int]]:
    head = (x - 22, y, x + 22, y + 44)
    draw.ellipse(head, outline=BLACK, width=3, fill=WHITE)
    draw.line((x, y + 44, x, y + 125), fill=BLACK, width=3)
    draw.line((x - 55, y + 72, x + 55, y + 72), fill=BLACK, width=3)
    draw.line((x, y + 125, x - 45, y + 185), fill=BLACK, width=3)
    draw.line((x, y + 125, x + 45, y + 185), fill=BLACK, width=3)

    width, _ = text_size(draw, label, FONT_ACTOR)
    draw.text((x - width // 2, y + 194), label, font=FONT_ACTOR, fill=BLACK)
    return {
        "center": (x, y + 92),
        "right": (x + 55, y + 72),
        "left": (x - 55, y + 72),
    }


def draw_line(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], *, dotted: bool = False) -> None:
    if not dotted:
        draw.line((start, end), fill=BLACK, width=3)
        return

    x1, y1 = start
    x2, y2 = end
    length = math.hypot(x2 - x1, y2 - y1)
    if length == 0:
        return
    dash = 8
    gap = 8
    steps = int(length // (dash + gap)) + 1
    for i in range(steps):
        start_distance = i * (dash + gap)
        end_distance = min(start_distance + dash, length)
        if start_distance >= length:
            break
        sx = x1 + (x2 - x1) * start_distance / length
        sy = y1 + (y2 - y1) * start_distance / length
        ex = x1 + (x2 - x1) * end_distance / length
        ey = y1 + (y2 - y1) * end_distance / length
        draw.line((sx, sy, ex, ey), fill=BLACK, width=2)


def draw_relation_label(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], text: str) -> None:
    x = (start[0] + end[0]) // 2
    y = (start[1] + end[1]) // 2
    width, height = text_size(draw, text, FONT_REL)
    draw.rectangle((x - width // 2 - 4, y - height // 2 - 3, x + width // 2 + 4, y + height // 2 + 3), fill=WHITE)
    draw.text((x - width // 2, y - height // 2), text, font=FONT_REL, fill=BLACK)


def connect_actor(draw: ImageDraw.ImageDraw, actor_point: tuple[int, int], use_case: tuple[int, int, int, int]) -> None:
    end = ellipse_anchor(use_case, actor_point)
    draw_line(draw, actor_point, end)


def connect_use_cases(
    draw: ImageDraw.ImageDraw,
    source: tuple[int, int, int, int],
    target: tuple[int, int, int, int],
    *,
    label: str | None = None,
) -> None:
    source_center = ellipse_center(source)
    target_center = ellipse_center(target)
    start = ellipse_anchor(source, target_center)
    end = ellipse_anchor(target, source_center)
    draw_line(draw, start, end, dotted=True)
    if label:
        draw_relation_label(draw, start, end, label)


def main() -> None:
    image = Image.new("RGB", (1800, 1350), WHITE)
    draw = ImageDraw.Draw(image)

    boundary = (215, 45, 1585, 1290)
    draw.rounded_rectangle(boundary, radius=120, outline=BLACK, width=3, fill=WHITE)
    centered_text(draw, (boundary[0], 55, boundary[2], 95), "CafeOS Ordering and Operations System", FONT_TITLE)

    customer = draw_actor(draw, 95, 505, "CUSTOMER")
    staff = draw_actor(draw, 1705, 310, "STAFF")
    admin = draw_actor(draw, 1705, 900, "ADMIN")

    use_cases: dict[str, tuple[int, int, int, int]] = {
        "login": (320, 130, 610, 215),
        "browse": (320, 285, 610, 370),
        "account_qr": (320, 440, 610, 525),
        "place_order": (320, 595, 610, 690),
        "track": (320, 765, 610, 850),
        "rewards": (320, 935, 610, 1030),
        "order_info": (755, 355, 1065, 445),
        "payment_info": (755, 555, 1065, 645),
        "loyalty_info": (755, 920, 1065, 1010),
        "scan_qr": (1190, 155, 1490, 245),
        "create_pos": (1190, 320, 1490, 410),
        "process_payment": (1190, 485, 1490, 575),
        "update_status": (1190, 650, 1490, 740),
        "delivery": (1190, 815, 1490, 905),
        "manage_menu": (1190, 965, 1490, 1055),
        "manage_vouchers": (1190, 1080, 1490, 1170),
        "manage_staff": (870, 1125, 1170, 1215),
        "reports": (755, 725, 1065, 815),
    }

    labels = {
        "login": "Register or Login",
        "browse": "Browse Menu",
        "account_qr": "View Account QR",
        "place_order": "Customize and Place Order",
        "track": "Track Order Status",
        "rewards": "View Points and Vouchers",
        "order_info": "Order Information",
        "payment_info": "Payment Information",
        "loyalty_info": "Loyalty and Voucher Information",
        "scan_qr": "Scan Account or Pickup QR",
        "create_pos": "Create POS Order",
        "process_payment": "Process Payment",
        "update_status": "Update Order Status",
        "delivery": "Book Delivery Request",
        "manage_menu": "Manage Menu and Inventory",
        "manage_vouchers": "Manage Vouchers and Loyalty",
        "manage_staff": "Manage Staff Accounts",
        "reports": "View Reports and Analytics",
    }

    for key in ["login", "browse", "account_qr", "place_order", "track", "rewards"]:
        connect_actor(draw, customer["right"], use_cases[key])

    for key in ["scan_qr", "create_pos", "process_payment", "update_status", "delivery"]:
        connect_actor(draw, staff["left"], use_cases[key])

    for key in ["manage_menu", "manage_vouchers", "manage_staff", "reports"]:
        connect_actor(draw, admin["left"], use_cases[key])

    connect_use_cases(draw, use_cases["manage_menu"], use_cases["browse"])
    connect_use_cases(draw, use_cases["account_qr"], use_cases["scan_qr"])
    connect_use_cases(draw, use_cases["place_order"], use_cases["order_info"])
    connect_use_cases(draw, use_cases["place_order"], use_cases["payment_info"])
    connect_use_cases(draw, use_cases["place_order"], use_cases["rewards"])
    connect_use_cases(draw, use_cases["create_pos"], use_cases["scan_qr"])
    connect_use_cases(draw, use_cases["create_pos"], use_cases["process_payment"])
    connect_use_cases(draw, use_cases["process_payment"], use_cases["payment_info"])
    connect_use_cases(draw, use_cases["update_status"], use_cases["track"])
    connect_use_cases(draw, use_cases["delivery"], use_cases["order_info"])
    connect_use_cases(draw, use_cases["rewards"], use_cases["loyalty_info"])
    connect_use_cases(draw, use_cases["manage_vouchers"], use_cases["loyalty_info"])
    connect_use_cases(draw, use_cases["reports"], use_cases["order_info"])

    for key, box in use_cases.items():
        draw_use_case(draw, box, labels[key])

    draw_actor(draw, 95, 505, "CUSTOMER")
    draw_actor(draw, 1705, 310, "STAFF")
    draw_actor(draw, 1705, 900, "ADMIN")

    legend = "Dotted lines show included or related use cases."
    width, _ = text_size(draw, legend, FONT_REL)
    draw.text((boundary[0] + (boundary[2] - boundary[0] - width) // 2, 1248), legend, font=FONT_REL, fill=BLACK)

    image.save(OUTPUT_PATH)
    print(f"WROTE={OUTPUT_PATH}")


if __name__ == "__main__":
    main()
