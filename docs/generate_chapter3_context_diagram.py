from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


DOCS_DIR = Path(__file__).parent
OUTPUT_PATH = DOCS_DIR / "chapter3_context_diagram.png"

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


FONT_ENTITY = load_font(19, "bold")
FONT_FLOW = load_font(15)
FONT_SYSTEM = load_font(24, "bold")
FONT_PROCESS = load_font(18, "bold")


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
        lines.extend(wrap_text(draw, part, font, x2 - x1 - 24))
    heights = [text_size(draw, line, font)[1] for line in lines]
    total_height = sum(heights) + max(0, len(lines) - 1) * 5
    y = y1 + ((y2 - y1) - total_height) // 2
    for line, height in zip(lines, heights):
        width, _ = text_size(draw, line, font)
        draw.text((x1 + ((x2 - x1) - width) // 2, y), line, font=font, fill=BLACK)
        y += height + 5


def draw_entity(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str) -> None:
    draw.rectangle(box, outline=BLACK, width=3, fill=WHITE)
    centered_text(draw, box, text, FONT_ENTITY)


def label_text(draw: ImageDraw.ImageDraw, center: tuple[int, int], text: str) -> None:
    lines = wrap_text(draw, text, FONT_FLOW, 330)
    heights = [text_size(draw, line, FONT_FLOW)[1] for line in lines]
    widths = [text_size(draw, line, FONT_FLOW)[0] for line in lines]
    box_width = max(widths) + 12
    box_height = sum(heights) + max(0, len(lines) - 1) * 2 + 8
    x, y = center
    draw.rectangle(
        (x - box_width // 2, y - box_height // 2, x + box_width // 2, y + box_height // 2),
        fill=WHITE,
    )
    text_y = y - box_height // 2 + 4
    for line, width, height in zip(lines, widths, heights):
        draw.text((x - width // 2, text_y), line, font=FONT_FLOW, fill=BLACK)
        text_y += height + 2


def arrow_head(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int]) -> None:
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    length = 14
    spread = math.radians(28)
    points = [end]
    for sign in (1, -1):
        theta = angle + math.pi + sign * spread
        points.append((int(end[0] + length * math.cos(theta)), int(end[1] + length * math.sin(theta))))
    draw.polygon(points, fill=BLACK)


def draw_arrow(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[int, int]],
    text: str,
    label_center: tuple[int, int],
) -> None:
    draw.line(points, fill=BLACK, width=2)
    arrow_head(draw, points[-2], points[-1])
    label_text(draw, label_center, text)


def circle_point(center: tuple[int, int], radius: int, target: tuple[int, int]) -> tuple[int, int]:
    dx = target[0] - center[0]
    dy = target[1] - center[1]
    distance = math.hypot(dx, dy)
    if distance == 0:
        return center
    return (int(center[0] + radius * dx / distance), int(center[1] + radius * dy / distance))


def main() -> None:
    image = Image.new("RGB", (1900, 1350), WHITE)
    draw = ImageDraw.Draw(image)

    system_center = (950, 600)
    system_radius = 260
    system_box = (
        system_center[0] - system_radius,
        system_center[1] - system_radius,
        system_center[0] + system_radius,
        system_center[1] + system_radius,
    )

    entities = {
        "customer": (20, 70, 360, 230),
        "staff": (20, 1070, 360, 1230),
        "admin": (1540, 70, 1880, 230),
        "external": (1540, 1070, 1880, 1230),
    }

    labels = {
        "customer": "CUSTOMER",
        "staff": "STAFF / POS",
        "admin": "ADMIN",
        "external": "EXTERNAL SERVICES\n(Maya / Lalamove)",
    }

    for key, box in entities.items():
        draw_entity(draw, box, labels[key])

    draw.ellipse(system_box, outline=BLACK, width=4, fill=WHITE)
    centered_text(draw, (system_center[0] - 25, system_center[1] - 175, system_center[0] + 25, system_center[1] - 140), "0", FONT_PROCESS)
    centered_text(
        draw,
        (system_center[0] - 155, system_center[1] - 75, system_center[0] + 155, system_center[1] + 75),
        "CafeOS Ordering and Operations System",
        FONT_SYSTEM,
    )

    customer_right = entities["customer"][2]
    staff_top = entities["staff"][1]
    staff_right = entities["staff"][2]
    admin_left = entities["admin"][0]
    external_left = entities["external"][0]
    external_top = entities["external"][1]

    flows: list[tuple[list[tuple[int, int]], str, tuple[int, int]]] = []

    # CUSTOMER -> system, routed from the top-left entity to the process.
    customer_inputs = [
        (90, 650, circle_point(system_center, system_radius, (710, 330)), "User Credentials"),
        (120, 690, circle_point(system_center, system_radius, (780, 320)), "Account QR Scan Data"),
        (150, 730, circle_point(system_center, system_radius, (850, 310)), "Order Details"),
        (180, 770, circle_point(system_center, system_radius, (920, 300)), "Payment / Points Request"),
    ]
    for y, rail_x, target, text in customer_inputs:
        flows.append(([(customer_right, y), (rail_x, y), target], text, ((customer_right + rail_x) // 2 + 10, y - 13)))

    # system -> CUSTOMER, routed back upward into the customer box.
    customer_outputs = [
        (90, circle_point(system_center, system_radius, (690, 490)), 460, "Menu and Stock Information"),
        (160, circle_point(system_center, system_radius, (690, 555)), 500, "Payment Link / Pickup QR"),
        (230, circle_point(system_center, system_radius, (690, 620)), 540, "Order Status and Receipt"),
        (300, circle_point(system_center, system_radius, (700, 685)), 580, "Points and Vouchers"),
    ]
    for x, start, rail_x, text in customer_outputs:
        flows.append(([start, (rail_x, start[1]), (rail_x, 250), (x, 250), (x, entities["customer"][3])], text, ((start[0] + rail_x) // 2 - 10, start[1] - 12)))

    # STAFF / POS -> system from the bottom-left entity.
    staff_inputs = [
        (80, 560, 1000, circle_point(system_center, system_radius, (720, 840)), "POS Order Details"),
        (145, 620, 975, circle_point(system_center, system_radius, (790, 890)), "Account / Pickup QR Result"),
        (210, 680, 950, circle_point(system_center, system_radius, (880, 905)), "Payment Confirmation"),
        (275, 740, 925, circle_point(system_center, system_radius, (960, 910)), "Order Status Update"),
    ]
    for x, rail_x, rail_y, target, text in staff_inputs:
        flows.append(([(x, staff_top), (x, rail_y), (rail_x, rail_y), target], text, ((x + rail_x) // 2 + 20, rail_y - 16)))

    # system -> STAFF / POS, routed down into the staff box.
    staff_outputs = [
        (120, circle_point(system_center, system_radius, (700, 725)), 500, 910, "Order Queue / KDS Details"),
        (185, circle_point(system_center, system_radius, (710, 780)), 545, 940, "Customer Account and Loyalty Info"),
        (250, circle_point(system_center, system_radius, (740, 830)), 590, 970, "Payment and Pickup Status"),
        (320, circle_point(system_center, system_radius, (820, 870)), 635, 1000, "Delivery Booking Status"),
    ]
    for x, start, rail_x, rail_y, text in staff_outputs:
        flows.append(([start, (rail_x, start[1]), (rail_x, rail_y), (x, rail_y), (x, staff_top)], text, ((start[0] + rail_x) // 2 - 10, start[1] + 14)))

    # ADMIN -> system from the top-right entity.
    admin_inputs = [
        (90, 1250, circle_point(system_center, system_radius, (1170, 330)), "Menu and Inventory Updates"),
        (120, 1210, circle_point(system_center, system_radius, (1110, 320)), "Voucher and Loyalty Settings"),
        (150, 1170, circle_point(system_center, system_radius, (1040, 310)), "Staff Account Management"),
        (180, 1130, circle_point(system_center, system_radius, (970, 300)), "System Configuration"),
    ]
    for y, rail_x, target, text in admin_inputs:
        flows.append(([(admin_left, y), (rail_x, y), target], text, ((admin_left + rail_x) // 2 - 20, y - 13)))

    # system -> ADMIN, routed back upward into the admin box.
    admin_outputs = [
        (1600, circle_point(system_center, system_radius, (1210, 490)), 1340, "Sales Reports"),
        (1665, circle_point(system_center, system_radius, (1210, 555)), 1385, "Inventory and Order Records"),
        (1730, circle_point(system_center, system_radius, (1210, 620)), 1430, "Audit Trails"),
        (1800, circle_point(system_center, system_radius, (1200, 685)), 1475, "Staff Activity Logs"),
    ]
    for x, start, rail_x, text in admin_outputs:
        flows.append(([start, (rail_x, start[1]), (rail_x, 250), (x, 250), (x, entities["admin"][3])], text, ((start[0] + rail_x) // 2 + 10, start[1] - 12)))

    # EXTERNAL SERVICES -> system from the bottom-right entity.
    external_inputs = [
        (1600, 1280, 945, circle_point(system_center, system_radius, (1180, 900)), "Maya Payment Confirmation"),
        (1690, 1335, 985, circle_point(system_center, system_radius, (1090, 915)), "Lalamove Rider Status"),
    ]
    for x, rail_x, rail_y, target, text in external_inputs:
        flows.append(([(x, external_top), (x, rail_y), (rail_x, rail_y), target], text, ((x + rail_x) // 2 - 10, rail_y - 16)))

    # system -> EXTERNAL SERVICES, routed down into the external-services box.
    external_outputs = [
        (1770, circle_point(system_center, system_radius, (1200, 760)), 1370, 910, "Maya Checkout Request"),
        (1840, circle_point(system_center, system_radius, (1190, 825)), 1420, 980, "Lalamove Booking Request"),
    ]
    for x, start, rail_x, rail_y, text in external_outputs:
        flows.append(([start, (rail_x, start[1]), (rail_x, rail_y), (x, rail_y), (x, external_top)], text, ((start[0] + rail_x) // 2 + 10, start[1] + 14)))

    for points, text, label_center in flows:
        draw_arrow(draw, points, text, label_center)

    image.save(OUTPUT_PATH)
    print(f"WROTE={OUTPUT_PATH}")


if __name__ == "__main__":
    main()
