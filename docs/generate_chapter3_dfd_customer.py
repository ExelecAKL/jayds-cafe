from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


DOCS_DIR = Path(__file__).parent
OUTPUT_PATH = DOCS_DIR / "chapter3_dfd_customer_perspective.png"

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


FONT_ENTITY = load_font(22, "bold")
FONT_PROCESS = load_font(24)
FONT_NUMBER = load_font(15, "bold")
FONT_FLOW = load_font(15, "bold")
FONT_STORE = load_font(16)
FONT_STORE_ID = load_font(17, "bold")


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
    lines: list[str] = []
    for part in text.splitlines():
        lines.extend(wrap_text(draw, part, font, x2 - x1 - 18))
    heights = [text_size(draw, line, font)[1] for line in lines]
    total_height = sum(heights) + max(0, len(lines) - 1) * 4
    y = y1 + ((y2 - y1) - total_height) // 2
    for line, height in zip(lines, heights):
        width, _ = text_size(draw, line, font)
        draw.text((x1 + ((x2 - x1) - width) // 2, y), line, font=font, fill=BLACK)
        y += height + 4


def draw_entity(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str) -> None:
    draw.rectangle(box, outline=BLACK, width=3, fill=WHITE)
    centered_text(draw, box, text, FONT_ENTITY)


def draw_process(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], number: str, text: str) -> None:
    x1, y1, x2, y2 = box
    draw.rounded_rectangle(box, radius=24, outline=BLACK, width=3, fill=WHITE)
    band_y = y1 + 30
    draw.line((x1, band_y, x2, band_y), fill=BLACK, width=2)
    centered_text(draw, (x1, y1 + 2, x2, band_y), number, FONT_NUMBER)
    centered_text(draw, (x1 + 8, band_y + 4, x2 - 8, y2 - 4), text, FONT_PROCESS)


def draw_store(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], store_id: str, name: str) -> None:
    x1, y1, x2, y2 = box
    id_width = 62
    draw.rectangle(box, outline=BLACK, width=2, fill=WHITE)
    draw.line((x1 + id_width, y1, x1 + id_width, y2), fill=BLACK, width=2)
    centered_text(draw, (x1, y1, x1 + id_width, y2), store_id, FONT_STORE_ID)
    centered_text(draw, (x1 + id_width, y1, x2, y2), name, FONT_STORE)


def arrow_head(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int]) -> None:
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    length = 13
    spread = math.radians(28)
    points = [end]
    for sign in (1, -1):
        theta = angle + math.pi + sign * spread
        points.append((int(end[0] + length * math.cos(theta)), int(end[1] + length * math.sin(theta))))
    draw.polygon(points, fill=BLACK)


def label(draw: ImageDraw.ImageDraw, point: tuple[int, int], text: str, max_width: int = 245) -> None:
    lines = wrap_text(draw, text, FONT_FLOW, max_width)
    heights = [text_size(draw, line, FONT_FLOW)[1] for line in lines]
    widths = [text_size(draw, line, FONT_FLOW)[0] for line in lines]
    box_width = max(widths) + 10
    box_height = sum(heights) + max(0, len(lines) - 1) * 2 + 8
    x, y = point
    draw.rectangle((x - box_width // 2, y - box_height // 2, x + box_width // 2, y + box_height // 2), fill=WHITE)
    text_y = y - box_height // 2 + 4
    for line, width, height in zip(lines, widths, heights):
        draw.text((x - width // 2, text_y), line, font=FONT_FLOW, fill=BLACK)
        text_y += height + 2


def arrow(draw: ImageDraw.ImageDraw, points: list[tuple[int, int]], text: str | None = None, label_at: tuple[int, int] | None = None) -> None:
    draw.line(points, fill=BLACK, width=2)
    arrow_head(draw, points[-2], points[-1])
    if text and label_at:
        label(draw, label_at, text)


def main() -> None:
    image = Image.new("RGB", (1650, 1180), WHITE)
    draw = ImageDraw.Draw(image)

    customer = (35, 45, 330, 205)
    draw_entity(draw, customer, "CUSTOMER")

    processes = [
        ((700, 45, 1010, 175), "1.0", "Login / Account Access"),
        ((700, 275, 1010, 405), "2.0", "Browse Menu"),
        ((700, 505, 1010, 635), "3.0", "Create Customer Order"),
        ((700, 735, 1010, 865), "4.0", "Process Payment and Pickup Confirmation"),
        ((700, 965, 1010, 1095), "5.0", "Manage Loyalty and Track Order"),
    ]

    stores = [
        ((1310, 78, 1620, 128), "D1", "profiles"),
        ((1310, 308, 1620, 358), "D2", "menu_items"),
        ((1310, 520, 1620, 570), "D3", "orders"),
        ((1310, 600, 1620, 650), "D4", "order_items"),
        ((1310, 768, 1620, 818), "D5", "payment_delivery_records"),
        ((1310, 998, 1620, 1048), "D6", "vouchers_loyalty"),
    ]

    for box, number, text in processes:
        draw_process(draw, box, number, text)
    for box, store_id, name in stores:
        draw_store(draw, box, store_id, name)

    customer_right = customer[2]
    process_left = 700
    process_right = 1010
    store_left = 1310

    # Customer to process flows, routed like the sample with horizontal lines from one external entity.
    customer_inputs = [
        (82, 87, "User Credentials"),
        (318, 322, "Menu Search / Category Selection"),
        (548, 552, "Selected Items and Customizations"),
        (778, 782, "Payment Method / Checkout Request"),
        (1008, 1012, "Account QR / Points or Voucher Request"),
    ]
    for source_y, target_y, text in customer_inputs:
        label_y = source_y - 16
        arrow(draw, [(customer_right, source_y), (620, source_y), (620, target_y), (process_left, target_y)], text, (530, label_y))

    # Process responses back to Customer.
    customer_outputs = [
        (118, 128, "System Entry / Account Status"),
        (360, 356, "Menu List / Item Details"),
        (590, 586, "Cart Summary / Order Review"),
        (820, 816, "Payment Link / Pickup QR Status"),
        (1050, 1046, "Points, Vouchers, and Order Tracking"),
    ]
    left_rails = [540, 510, 480, 450, 420]
    for index, (target_y, start_y, text) in enumerate(customer_outputs):
        rail_x = left_rails[index]
        customer_anchor_x = 95 + index * 45
        arrow(
            draw,
            [(process_left, start_y), (rail_x, start_y), (rail_x, 230 + index * 18), (customer_anchor_x, 230 + index * 18), (customer_anchor_x, customer[3])],
            text,
            (585, start_y - 15),
        )

    for source_y, _target_y, text in customer_inputs:
        label_y = source_y - 16
        label(draw, (530, label_y), text)

    # Process and data store interactions on the right.
    store_flows = [
        ((process_right, 86), (store_left, 86), "User Details"),
        ((store_left, 120), (process_right, 120), "User Details"),
        ((process_right, 316), (store_left, 316), "Menu Query"),
        ((store_left, 350), (process_right, 350), "Menu Details / Stock Availability"),
        ((process_right, 540), (store_left, 540), "Order Information"),
        ((process_right, 620), (store_left, 620), "Order Item Details"),
        ((store_left, 568), (process_right, 568), "Order Details"),
        ((store_left, 648), (process_right, 648), "Item Details"),
        ((process_right, 776), (store_left, 776), "Payment and Delivery Details"),
        ((store_left, 810), (process_right, 810), "Payment Confirmation / Delivery Status"),
        ((process_right, 838), (1310, 838), "Confirmed Order Status"),
        ((process_right, 1006), (store_left, 1006), "Loyalty and Voucher Query"),
        ((store_left, 1040), (process_right, 1040), "Voucher Details / Points Record"),
        ((process_right, 1080), (1310, 1080), "Order Status Query"),
    ]

    for start, end, text in store_flows:
        arrow(draw, [start, end], text, ((start[0] + end[0]) // 2, start[1] - 15))

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT_PATH)
    print(f"WROTE={OUTPUT_PATH}")


if __name__ == "__main__":
    main()
