from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


DOCS_DIR = Path(__file__).parent
OUTPUT_STAFF = DOCS_DIR / "chapter3_dfd_staff_perspective.png"
OUTPUT_ADMIN = DOCS_DIR / "chapter3_dfd_admin_perspective.png"

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
FONT_PROCESS = load_font(23)
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


def label(draw: ImageDraw.ImageDraw, point: tuple[int, int], text: str, max_width: int = 250) -> None:
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


def render_dfd(
    output_path: Path,
    entity_name: str,
    processes: list[tuple[str, str]],
    stores: list[tuple[str, str]],
    entity_inputs: list[tuple[str, int]],
    entity_outputs: list[tuple[str, int]],
    store_flows: list[tuple[int, str, str, str]],
) -> None:
    image = Image.new("RGB", (1680, 1220), WHITE)
    draw = ImageDraw.Draw(image)
    labels: list[tuple[tuple[int, int], str, int]] = []

    entity = (35, 45, 330, 205)
    draw_entity(draw, entity, entity_name)

    process_boxes: list[tuple[int, int, int, int]] = []
    process_ys = [45, 285, 525, 765, 1005]
    for index, ((number, title), y) in enumerate(zip(processes, process_ys), start=1):
        box = (720, y, 1040, y + 130)
        process_boxes.append(box)
        draw_process(draw, box, number, title)

    store_boxes: dict[str, tuple[int, int, int, int]] = {}
    store_ys = [78, 318, 538, 618, 798, 1038, 1110]
    for (store_id, store_name), y in zip(stores, store_ys):
        box = (1320, y, 1640, y + 50)
        store_boxes[store_id] = box
        draw_store(draw, box, store_id, store_name)

    entity_right = entity[2]
    process_left = 720
    process_right = 1040
    store_left = 1320

    input_rail_x = 640
    for index, (text, process_index) in enumerate(entity_inputs):
        source_y = 82 + index * 72
        target_box = process_boxes[process_index - 1]
        target_y = target_box[1] + 42
        arrow(
            draw,
            [(entity_right, source_y), (input_rail_x, source_y), (input_rail_x, target_y), (process_left, target_y)],
        )
        labels.append(((535, source_y - 18), text, 270))

    output_rails = [555, 525, 495, 465, 435]
    for index, (text, process_index) in enumerate(entity_outputs):
        source_box = process_boxes[process_index - 1]
        start_y = source_box[1] + 88
        rail_x = output_rails[index]
        anchor_x = 95 + index * 45
        top_y = 230 + index * 18
        arrow(
            draw,
            [(process_left, start_y), (rail_x, start_y), (rail_x, top_y), (anchor_x, top_y), (anchor_x, entity[3])],
        )
        labels.append(((590, start_y + 18), text, 285))

    flow_offsets: dict[tuple[int, str], int] = {}
    for process_index, direction, store_id, text in store_flows:
        process_box = process_boxes[process_index - 1]
        store_box = store_boxes[store_id]
        offset_key = (process_index, direction)
        offset = flow_offsets.get(offset_key, 0)
        flow_offsets[offset_key] = offset + 1
        if direction == "to":
            start = (process_right, process_box[1] + 42 + offset * 24)
            end = (store_left, (store_box[1] + store_box[3]) // 2)
            label_point = ((start[0] + end[0]) // 2, min(start[1], end[1]) - 24 - offset * 2)
        else:
            start = (store_left, (store_box[1] + store_box[3]) // 2)
            end = (process_right, process_box[1] + 88 + offset * 20)
            label_point = ((start[0] + end[0]) // 2, max(start[1], end[1]) + 22 + offset * 2)
        mid_y = start[1]
        arrow(draw, [start, end])
        labels.append((label_point, text, 250))

    for point, text, max_width in labels:
        label(draw, point, text, max_width)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path)
    print(f"WROTE={output_path}")


def main() -> None:
    render_dfd(
        OUTPUT_STAFF,
        "STAFF / POS",
        [
            ("1.0", "Login and Access POS"),
            ("2.0", "Scan Account or Pickup QR"),
            ("3.0", "Create and Process POS Order"),
            ("4.0", "Manage KDS and Order Status"),
            ("5.0", "Book Delivery and Complete Order"),
        ],
        [
            ("D1", "profiles"),
            ("D2", "pickup_tokens"),
            ("D3", "orders"),
            ("D4", "order_items"),
            ("D5", "order_status_history"),
            ("D6", "payment_delivery_records"),
            ("D7", "inventory_logs"),
        ],
        [
            ("Staff Credentials", 1),
            ("Account QR / Pickup QR Scan", 2),
            ("POS Order and Payment Details", 3),
            ("Kitchen Status Update", 4),
            ("Delivery or Completion Request", 5),
        ],
        [
            ("System Entry / Staff Session", 1),
            ("Customer Account / Pickup Result", 2),
            ("Order Queue / Receipt Details", 3),
            ("KDS and Ready Status", 4),
            ("Delivery Status / Completed Order", 5),
        ],
        [
            (1, "to", "D1", "Staff Session Details"),
            (1, "from", "D1", "Staff User Details"),
            (2, "to", "D2", "QR Token Query"),
            (2, "from", "D2", "Pickup Token Details"),
            (3, "to", "D3", "Order Information"),
            (3, "to", "D4", "Order Item Details"),
            (3, "from", "D3", "Order Details"),
            (4, "to", "D5", "Status History"),
            (4, "from", "D3", "Active Order List"),
            (5, "to", "D6", "Delivery Booking Details"),
            (5, "from", "D6", "Delivery / Payment Status"),
            (5, "to", "D7", "Inventory Deduction Log"),
        ],
    )

    render_dfd(
        OUTPUT_ADMIN,
        "ADMIN",
        [
            ("1.0", "Login and Authorize Admin"),
            ("2.0", "Manage Menu and Inventory"),
            ("3.0", "Manage Vouchers and Loyalty"),
            ("4.0", "Manage Staff and Security"),
            ("5.0", "Monitor Reports and Configuration"),
        ],
        [
            ("D1", "profiles"),
            ("D2", "menu_items"),
            ("D3", "ingredients_inventory"),
            ("D4", "vouchers_loyalty"),
            ("D5", "staff_security_logs"),
            ("D6", "orders_reports"),
            ("D7", "store_delivery_settings"),
        ],
        [
            ("Admin Credentials", 1),
            ("Menu / Inventory Updates", 2),
            ("Voucher and Loyalty Settings", 3),
            ("Staff Account / Security Request", 4),
            ("Report and Configuration Request", 5),
        ],
        [
            ("System Entry / Admin Access", 1),
            ("Menu and Stock Records", 2),
            ("Voucher / Loyalty Summary", 3),
            ("Staff and Audit Details", 4),
            ("Reports and Settings Summary", 5),
        ],
        [
            (1, "to", "D1", "Admin User Details"),
            (1, "from", "D1", "Profile and Role Details"),
            (2, "to", "D2", "Menu Item Updates"),
            (2, "from", "D2", "Menu Details"),
            (2, "to", "D3", "Inventory Adjustment"),
            (2, "from", "D3", "Stock Details"),
            (3, "to", "D4", "Voucher / Points Rules"),
            (3, "from", "D4", "Claims and Loyalty Details"),
            (4, "to", "D5", "Staff and Authorization Updates"),
            (4, "from", "D5", "Audit and Security Records"),
            (5, "from", "D6", "Sales and Order Reports"),
            (5, "to", "D7", "Store / Delivery Settings"),
            (5, "from", "D7", "Configuration Details"),
        ],
    )


if __name__ == "__main__":
    main()
