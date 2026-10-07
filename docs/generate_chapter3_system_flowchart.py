from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


DOCS_DIR = Path(__file__).parent
OUTPUT_PART1 = DOCS_DIR / "chapter3_system_flowchart_part1.png"
OUTPUT_PART2 = DOCS_DIR / "chapter3_system_flowchart_part2.png"

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


FONT_TITLE = load_font(23, "bold")
FONT_SHAPE = load_font(18)
FONT_SMALL = load_font(15)


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


def centered_text(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str, font=FONT_SHAPE) -> None:
    x1, y1, x2, y2 = box
    lines: list[str] = []
    for part in text.splitlines():
        lines.extend(wrap_text(draw, part, font, x2 - x1 - 18))
    heights = [text_size(draw, line, font)[1] for line in lines]
    total_height = sum(heights) + max(0, len(lines) - 1) * 3
    y = y1 + ((y2 - y1) - total_height) // 2
    for line, height in zip(lines, heights):
        width, _ = text_size(draw, line, font)
        draw.text((x1 + ((x2 - x1) - width) // 2, y), line, font=font, fill=BLACK)
        y += height + 3


def draw_rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str) -> None:
    draw.rectangle(box, outline=BLACK, width=3, fill=WHITE)
    centered_text(draw, box, text)


def draw_input(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str) -> None:
    x1, y1, x2, y2 = box
    slant = 22
    points = [(x1 + slant, y1), (x2, y1), (x2 - slant, y2), (x1, y2)]
    draw.polygon(points, outline=BLACK, fill=WHITE)
    draw.line(points + [points[0]], fill=BLACK, width=3)
    centered_text(draw, box, text)


def draw_terminator(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str) -> None:
    draw.ellipse(box, outline=BLACK, width=3, fill=WHITE)
    centered_text(draw, box, text, FONT_SMALL)


def draw_decision(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str) -> None:
    x1, y1, x2, y2 = box
    cx = (x1 + x2) // 2
    cy = (y1 + y2) // 2
    points = [(cx, y1), (x2, cy), (cx, y2), (x1, cy)]
    draw.polygon(points, outline=BLACK, fill=WHITE)
    draw.line(points + [points[0]], fill=BLACK, width=3)
    centered_text(draw, (x1 + 22, y1 + 18, x2 - 22, y2 - 18), text, FONT_SMALL)


def draw_connector(draw: ImageDraw.ImageDraw, center: tuple[int, int], label: str) -> tuple[int, int, int, int]:
    x, y = center
    points = [(x - 26, y - 20), (x + 26, y - 20), (x + 26, y + 8), (x, y + 28), (x - 26, y + 8)]
    draw.polygon(points, outline=BLACK, fill=WHITE)
    draw.line(points + [points[0]], fill=BLACK, width=3)
    centered_text(draw, (x - 24, y - 18, x + 24, y + 16), label, FONT_SMALL)
    return (x - 26, y - 20, x + 26, y + 28)


def arrow_head(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int]) -> None:
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    length = 13
    spread = math.radians(28)
    points = [end]
    for sign in (1, -1):
        theta = angle + math.pi + sign * spread
        points.append((int(end[0] + length * math.cos(theta)), int(end[1] + length * math.sin(theta))))
    draw.polygon(points, fill=BLACK)


def arrow(draw: ImageDraw.ImageDraw, points: list[tuple[int, int]], label: str | None = None, label_at: tuple[int, int] | None = None) -> None:
    draw.line(points, fill=BLACK, width=2)
    arrow_head(draw, points[-2], points[-1])
    if label and label_at:
        width, height = text_size(draw, label, FONT_SMALL)
        x, y = label_at
        draw.rectangle((x - width // 2 - 4, y - height // 2 - 3, x + width // 2 + 4, y + height // 2 + 3), fill=WHITE)
        draw.text((x - width // 2, y - height // 2), label, font=FONT_SMALL, fill=BLACK)


def top(box: tuple[int, int, int, int]) -> tuple[int, int]:
    return ((box[0] + box[2]) // 2, box[1])


def bottom(box: tuple[int, int, int, int]) -> tuple[int, int]:
    return ((box[0] + box[2]) // 2, box[3])


def left(box: tuple[int, int, int, int]) -> tuple[int, int]:
    return (box[0], (box[1] + box[3]) // 2)


def right(box: tuple[int, int, int, int]) -> tuple[int, int]:
    return (box[2], (box[1] + box[3]) // 2)


def add_page_title(draw: ImageDraw.ImageDraw, text: str) -> None:
    width, _ = text_size(draw, text, FONT_TITLE)
    draw.text(((1000 - width) // 2, 25), text, font=FONT_TITLE, fill=BLACK)


def draw_part_one() -> None:
    image = Image.new("RGB", (1000, 1700), WHITE)
    draw = ImageDraw.Draw(image)
    add_page_title(draw, "Proposed CafeOS System Flowchart - Part 1")

    start = (435, 70, 565, 120)
    open_app = (380, 155, 620, 215)
    choose = (395, 250, 605, 360)

    draw_terminator(draw, start, "START")
    draw_rect(draw, open_app, "Open CafeOS Web App")
    draw_decision(draw, choose, "Select User Type?")
    arrow(draw, [bottom(start), top(open_app)])
    arrow(draw, [bottom(open_app), top(choose)])

    # Customer ordering flow
    customer_login = (80, 415, 330, 475)
    has_account = (100, 520, 310, 620)
    load_profile = (35, 675, 240, 735)
    guest = (265, 675, 470, 735)
    browse = (115, 780, 365, 840)
    customize = (115, 885, 365, 945)
    fulfillment = (130, 975, 350, 1075)
    pickup = (35, 1125, 230, 1185)
    delivery = (275, 1125, 470, 1185)
    delivery_fee = (275, 1230, 470, 1290)
    discount = (115, 1335, 365, 1395)
    payment = (115, 1440, 365, 1500)
    save_online = (115, 1545, 365, 1605)
    customer_connector = draw_connector(draw, (250, 1655), "1")

    draw_rect(draw, customer_login, "Login, Register, or Continue as Guest")
    draw_decision(draw, has_account, "Has Customer Account?")
    draw_rect(draw, load_profile, "Load Profile, Points, and Vouchers")
    draw_rect(draw, guest, "Start Guest Session")
    draw_rect(draw, browse, "Browse Menu and Stock")
    draw_rect(draw, customize, "Customize Items and Cart")
    draw_decision(draw, fulfillment, "Pickup or Delivery?")
    draw_rect(draw, pickup, "Set Pickup or Advance Pickup Time")
    draw_input(draw, delivery, "Enter Delivery Address")
    draw_rect(draw, delivery_fee, "Calculate Delivery Fee")
    draw_rect(draw, discount, "Apply Voucher or Points")
    draw_rect(draw, payment, "Select Payment and Submit Order")
    draw_rect(draw, save_online, "Save Order and Notify POS")

    arrow(draw, [left(choose), (250, 305), top(customer_login)], "Customer", (250, 285))
    arrow(draw, [bottom(customer_login), top(has_account)])
    arrow(draw, [left(has_account), (135, 620), top(load_profile)], "Yes", (105, 645))
    arrow(draw, [right(has_account), (365, 620), top(guest)], "No", (395, 645))
    arrow(draw, [bottom(load_profile), (137, 755), (240, 755), top(browse)])
    arrow(draw, [bottom(guest), (367, 755), (240, 755), top(browse)])
    arrow(draw, [bottom(browse), top(customize)])
    arrow(draw, [bottom(customize), top(fulfillment)])
    arrow(draw, [left(fulfillment), (135, 1090), top(pickup)], "Pickup", (92, 1118))
    arrow(draw, [right(fulfillment), (373, 1090), top(delivery)], "Delivery", (420, 1118))
    arrow(draw, [bottom(delivery), top(delivery_fee)])
    arrow(draw, [bottom(pickup), (132, 1315), (250, 1315), top(discount)])
    arrow(draw, [bottom(delivery_fee), (372, 1315), (250, 1315), top(discount)])
    arrow(draw, [bottom(discount), top(payment)])
    arrow(draw, [bottom(payment), top(save_online)])
    arrow(draw, [bottom(save_online), top(customer_connector)])

    # POS order flow
    staff_login = (675, 415, 925, 475)
    scan_qr = (695, 520, 905, 620)
    load_customer = (560, 675, 765, 735)
    guest_pos = (790, 675, 960, 735)
    add_items = (635, 780, 885, 840)
    apply_points = (635, 885, 885, 945)
    branch_payment = (635, 990, 885, 1050)
    create_pos = (635, 1095, 885, 1155)
    send_kds = (635, 1200, 885, 1260)
    update_dashboard = (635, 1305, 885, 1365)
    pos_connector = draw_connector(draw, (760, 1655), "1")
    admin_connector = draw_connector(draw, (500, 435), "2")

    draw_rect(draw, staff_login, "Staff Login")
    draw_decision(draw, scan_qr, "Scan Customer QR?")
    draw_rect(draw, load_customer, "Load Customer Points and Profile")
    draw_rect(draw, guest_pos, "Guest POS Order")
    draw_rect(draw, add_items, "Add Items and Customizations")
    draw_rect(draw, apply_points, "Apply Points or Discount")
    draw_rect(draw, branch_payment, "Process Branch Payment")
    draw_rect(draw, create_pos, "Create POS Order")
    draw_rect(draw, send_kds, "Send to KDS / Dashboard")
    draw_rect(draw, update_dashboard, "Save POS Order")

    arrow(draw, [right(choose), (760, 305), top(staff_login)], "Staff", (760, 285))
    arrow(draw, [bottom(choose), top(admin_connector)], "Admin", (545, 397))
    arrow(draw, [bottom(staff_login), top(scan_qr)])
    arrow(draw, [left(scan_qr), (662, 620), top(load_customer)], "Yes", (620, 645))
    arrow(draw, [right(scan_qr), (875, 650), top(guest_pos)], "No", (915, 645))
    arrow(draw, [bottom(load_customer), (662, 755), (760, 755), top(add_items)])
    arrow(draw, [bottom(guest_pos), (875, 755), (760, 755), top(add_items)])
    arrow(draw, [bottom(add_items), top(apply_points)])
    arrow(draw, [bottom(apply_points), top(branch_payment)])
    arrow(draw, [bottom(branch_payment), top(create_pos)])
    arrow(draw, [bottom(create_pos), top(send_kds)])
    arrow(draw, [bottom(send_kds), top(update_dashboard)])
    arrow(draw, [bottom(update_dashboard), top(pos_connector)])

    image.save(OUTPUT_PART1)


def draw_part_two() -> None:
    image = Image.new("RGB", (1000, 1450), WHITE)
    draw = ImageDraw.Draw(image)
    add_page_title(draw, "Proposed CafeOS System Flowchart - Part 2")

    connector_order = draw_connector(draw, (250, 75), "1")
    queue = (120, 135, 380, 195)
    prepare = (120, 245, 380, 305)
    preparing = (120, 355, 380, 415)
    ready = (140, 470, 360, 570)
    continue_prep = (405, 490, 610, 550)
    status_ready = (120, 625, 380, 685)
    delivery_order = (140, 740, 360, 840)
    book_lalamove = (35, 895, 240, 955)
    tracking = (35, 1005, 240, 1065)
    pickup_scan = (270, 895, 475, 955)
    serve = (270, 1005, 475, 1065)
    complete = (120, 1120, 380, 1180)
    inventory = (120, 1230, 380, 1290)
    receipt = (120, 1340, 380, 1400)

    draw_rect(draw, queue, "Display Order in POS / KDS")
    draw_rect(draw, prepare, "Staff Prepares Order")
    draw_rect(draw, preparing, "Update Status: Preparing")
    draw_decision(draw, ready, "Order Ready?")
    draw_rect(draw, continue_prep, "Continue Preparation")
    draw_rect(draw, status_ready, "Update Status: Ready")
    draw_decision(draw, delivery_order, "Delivery Order?")
    draw_rect(draw, book_lalamove, "Book Lalamove Delivery")
    draw_rect(draw, tracking, "Store Rider Status and Tracking Link")
    draw_rect(draw, pickup_scan, "Scan Pickup QR if Required")
    draw_rect(draw, serve, "Release Pickup / Walk-in Order")
    draw_rect(draw, complete, "Complete Order")
    draw_rect(draw, inventory, "Deduct Inventory Usage")
    draw_rect(draw, receipt, "Earn Points and Save Receipt")

    arrow(draw, [bottom(connector_order), top(queue)])
    arrow(draw, [bottom(queue), top(prepare)])
    arrow(draw, [bottom(prepare), top(preparing)])
    arrow(draw, [bottom(preparing), top(ready)])
    arrow(draw, [right(ready), left(continue_prep)], "No", (385, 505))
    arrow(draw, [bottom(continue_prep), (507, 600), (250, 600), top(preparing)])
    arrow(draw, [bottom(ready), top(status_ready)], "Yes", (285, 598))
    arrow(draw, [bottom(status_ready), top(delivery_order)])
    arrow(draw, [left(delivery_order), (137, 840), top(book_lalamove)], "Yes", (92, 868))
    arrow(draw, [bottom(book_lalamove), top(tracking)])
    arrow(draw, [right(delivery_order), (372, 840), top(pickup_scan)], "No", (418, 868))
    arrow(draw, [bottom(pickup_scan), top(serve)])
    arrow(draw, [bottom(tracking), (137, 1095), (250, 1095), top(complete)])
    arrow(draw, [bottom(serve), (372, 1095), (250, 1095), top(complete)])
    arrow(draw, [bottom(complete), top(inventory)])
    arrow(draw, [bottom(inventory), top(receipt)])

    connector_admin = draw_connector(draw, (740, 75), "2")
    admin_login = (610, 135, 870, 195)
    manage_menu = (610, 245, 870, 305)
    manage_staff = (610, 355, 870, 415)
    reports = (610, 465, 870, 525)
    audit = (610, 575, 870, 635)
    admin_end = (675, 690, 805, 745)

    draw_rect(draw, admin_login, "Admin Login")
    draw_rect(draw, manage_menu, "Manage Menu, Inventory, and Vouchers")
    draw_rect(draw, manage_staff, "Manage Staff and System Settings")
    draw_rect(draw, reports, "View Sales, Inventory, and Audit Reports")
    draw_rect(draw, audit, "Save Updates to Database")
    draw_terminator(draw, admin_end, "END")

    arrow(draw, [bottom(connector_admin), top(admin_login)])
    arrow(draw, [bottom(admin_login), top(manage_menu)])
    arrow(draw, [bottom(manage_menu), top(manage_staff)])
    arrow(draw, [bottom(manage_staff), top(reports)])
    arrow(draw, [bottom(reports), top(audit)])
    arrow(draw, [bottom(audit), top(admin_end)])

    end = (185, 1410, 315, 1445)
    draw_terminator(draw, end, "END")
    arrow(draw, [bottom(receipt), top(end)])

    image.save(OUTPUT_PART2)


def main() -> None:
    draw_part_one()
    draw_part_two()
    print(f"WROTE={OUTPUT_PART1}")
    print(f"WROTE={OUTPUT_PART2}")


if __name__ == "__main__":
    main()
