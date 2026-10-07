from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


DOCS_DIR = Path(__file__).parent
OUTPUT_LEVEL0 = DOCS_DIR / "dfd_level_0_classic.png"
OUTPUT_LEVEL1 = DOCS_DIR / "dfd_level_1_classic.png"


def font_path(name: str) -> str | None:
    candidates = {
        "regular": [
            r"C:\Windows\Fonts\arial.ttf",
            r"C:\Windows\Fonts\Arial.ttf",
        ],
        "bold": [
            r"C:\Windows\Fonts\arialbd.ttf",
            r"C:\Windows\Fonts\Arialbd.ttf",
        ],
        "italic": [
            r"C:\Windows\Fonts\ariali.ttf",
            r"C:\Windows\Fonts\Ariali.ttf",
        ],
        "bold_italic": [
            r"C:\Windows\Fonts\arialbi.ttf",
            r"C:\Windows\Fonts\Arialbi.ttf",
        ],
    }
    for candidate in candidates[name]:
        if Path(candidate).exists():
            return candidate
    return None


def load_font(size: int, kind: str = "regular") -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = font_path(kind)
    if path:
        return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


FONT_REG_18 = load_font(18)
FONT_REG_20 = load_font(20)
FONT_REG_22 = load_font(22)
FONT_BOLD_22 = load_font(22, "bold")
FONT_BOLD_24 = load_font(24, "bold")
FONT_BOLD_26 = load_font(26, "bold")
FONT_ITALIC_18 = load_font(18, "italic")
FONT_ITALIC_20 = load_font(20, "italic")
FONT_BOLDITALIC_22 = load_font(22, "bold_italic")

BLACK = "#111111"
WHITE = "#ffffff"
ACCENT = "#f6c65b"
ACCENT_LIGHT = "#ffe7a7"
PROCESS_FILL = "#fcfcfc"


def text_size(draw: ImageDraw.ImageDraw, text: str, font) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        paragraph = paragraph.strip()
        if not paragraph:
            lines.append("")
            continue
        words = paragraph.split()
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


def draw_multiline(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    text: str,
    font,
    max_width: int,
    *,
    fill: str = BLACK,
    align: str = "left",
    line_gap: int = 6,
) -> int:
    lines = wrap_text(draw, text, font, max_width)
    current_y = y
    for line in lines:
        width, height = text_size(draw, line, font)
        draw_x = x
        if align == "center":
            draw_x = x + (max_width - width) // 2
        elif align == "right":
            draw_x = x + max_width - width
        draw.text((draw_x, current_y), line, font=font, fill=fill)
        current_y += height + line_gap
    return current_y


def draw_external_entity(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    h: int,
    *,
    code: str,
    title: str,
) -> None:
    draw.rectangle((x - 12, y - 12, x + w - 12, y + h - 12), fill=ACCENT, outline=BLACK, width=1)
    draw.rectangle((x - 6, y - 6, x + w - 6, y + h - 6), fill=ACCENT_LIGHT, outline=BLACK, width=1)
    draw.rectangle((x, y, x + w, y + h), fill=WHITE, outline=BLACK, width=2)
    draw.text((x + 14, y + 12), code, font=FONT_ITALIC_20, fill=BLACK)
    draw_multiline(draw, x + 20, y + 48, title, FONT_BOLDITALIC_22, w - 40, align="center")


def draw_process(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    h: int,
    *,
    number: str,
    title: str,
    footer: str,
) -> None:
    header_h = 42
    footer_h = 34
    draw.rounded_rectangle((x, y, x + w, y + h), radius=12, fill=PROCESS_FILL, outline=BLACK, width=2)
    draw.line((x, y + header_h, x + w, y + header_h), fill=BLACK, width=2)
    draw.line((x, y + h - footer_h, x + w, y + h - footer_h), fill=BLACK, width=2)
    draw_multiline(draw, x + 8, y + 8, number, FONT_REG_18, w - 16, align="center", line_gap=0)
    draw_multiline(draw, x + 24, y + 60, title, FONT_REG_22, w - 48, align="center", line_gap=4)
    draw_multiline(draw, x + 16, y + h - footer_h + 6, footer, FONT_ITALIC_18, w - 32, align="left", line_gap=0)


def draw_data_store(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    h: int,
    *,
    code: str,
    title: str,
) -> None:
    code_w = 62
    draw.rectangle((x, y, x + w, y + h), fill=WHITE, outline=BLACK, width=2)
    draw.line((x + code_w, y, x + code_w, y + h), fill=BLACK, width=2)
    draw.text((x + 12, y + 10), code, font=FONT_REG_20, fill=BLACK)
    draw_multiline(draw, x + code_w + 12, y + 10, title, FONT_REG_20, w - code_w - 24)


def arrow_head(draw: ImageDraw.ImageDraw, tip: tuple[int, int], direction: str, size: int = 14) -> None:
    x, y = tip
    if direction == "right":
        points = [(x, y), (x - size, y - size // 2), (x - size, y + size // 2)]
    elif direction == "left":
        points = [(x, y), (x + size, y - size // 2), (x + size, y + size // 2)]
    elif direction == "up":
        points = [(x, y), (x - size // 2, y + size), (x + size // 2, y + size)]
    else:
        points = [(x, y), (x - size // 2, y - size), (x + size // 2, y - size)]
    draw.polygon(points, fill=WHITE, outline=BLACK)


def draw_poly_arrow(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[int, int]],
    *,
    end_direction: str,
    width: int = 3,
) -> None:
    draw.line(points, fill=BLACK, width=width)
    arrow_head(draw, points[-1], end_direction)


def draw_label(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    text: str,
    *,
    max_width: int = 220,
    align: str = "left",
) -> None:
    lines = wrap_text(draw, text, FONT_ITALIC_18, max_width)
    widths: list[int] = []
    heights: list[int] = []
    for line in lines:
        width, height = text_size(draw, line, FONT_ITALIC_18)
        widths.append(width)
        heights.append(height)

    pad_x = 8
    pad_y = 5
    line_gap = 2
    box_width = max(widths, default=0)
    box_height = sum(heights) + max(len(lines) - 1, 0) * line_gap
    if align == "center":
        box_x = x + (max_width - box_width) // 2
    elif align == "right":
        box_x = x + max_width - box_width
    else:
        box_x = x
    draw.rectangle(
        (box_x - pad_x, y - pad_y, box_x + box_width + pad_x, y + box_height + pad_y),
        fill=WHITE,
    )
    draw_multiline(draw, x, y, text, FONT_ITALIC_18, max_width, fill=BLACK, align=align, line_gap=line_gap)


def create_level0() -> None:
    image = Image.new("RGB", (1900, 1100), WHITE)
    draw = ImageDraw.Draw(image)

    draw_external_entity(draw, 80, 80, 220, 140, code="e1", title="Customer")
    draw_external_entity(draw, 80, 450, 220, 140, code="e2", title="POS Staff")
    draw_external_entity(draw, 80, 840, 220, 140, code="e3", title="Admin / Manager")

    draw_external_entity(draw, 1580, 200, 230, 150, code="e4", title="Maya Payment Gateway")
    draw_external_entity(draw, 1580, 650, 230, 150, code="e5", title="Lalamove Delivery Service")

    draw_process(
        draw,
        650,
        350,
        600,
        300,
        number="0.0",
        title="Jayd's Cafe Ordering and Operations System",
        footer="Ordering and Operations",
    )

    draw_poly_arrow(draw, [(300, 150), (650, 150), (650, 350)], end_direction="down")
    draw_label(draw, 370, 105, "Order and account\ndetails")

    draw_poly_arrow(draw, [(650, 440), (300, 440)], end_direction="left")
    draw_label(draw, 355, 452, "Menu, status,\nreceipt, rewards")

    draw_poly_arrow(draw, [(300, 520), (560, 520), (560, 505), (650, 505)], end_direction="right")
    draw_label(draw, 335, 486, "Walk-in order and\npayment data")

    draw_poly_arrow(draw, [(650, 585), (560, 585), (560, 600), (300, 600)], end_direction="left")
    draw_label(draw, 340, 612, "Order queue and\npickup details")

    draw_poly_arrow(draw, [(300, 910), (590, 910), (590, 640), (650, 640)], end_direction="right")
    draw_label(draw, 330, 865, "Menu, inventory,\nvoucher, report requests")

    draw_poly_arrow(draw, [(650, 625), (530, 625), (530, 965), (300, 965)], end_direction="left")
    draw_label(draw, 335, 665, "Reports, analytics,\norder and stock data")

    draw_poly_arrow(draw, [(1250, 420), (1415, 420), (1415, 275), (1580, 275)], end_direction="right")
    draw_label(draw, 1290, 382, "Checkout request,\npayment verification")

    draw_poly_arrow(draw, [(1580, 325), (1415, 325), (1415, 470), (1250, 470)], end_direction="left")
    draw_label(draw, 1288, 482, "Payment result,\nwebhook status")

    draw_poly_arrow(draw, [(1250, 545), (1410, 545), (1410, 725), (1580, 725)], end_direction="right")
    draw_label(draw, 1285, 555, "Delivery quotation\nand booking request")

    draw_poly_arrow(draw, [(1580, 775), (1410, 775), (1410, 600), (1250, 600)], end_direction="left")
    draw_label(draw, 1288, 787, "Quotation, booking,\nand delivery status")

    image.save(OUTPUT_LEVEL0)


def create_level1() -> None:
    image = Image.new("RGB", (2200, 1500), WHITE)
    draw = ImageDraw.Draw(image)

    draw_external_entity(draw, 70, 80, 220, 130, code="e1", title="Customer")
    draw_external_entity(draw, 1880, 80, 240, 150, code="e2", title="Maya Payment Gateway")
    draw_external_entity(draw, 1880, 620, 240, 150, code="e3", title="Lalamove Delivery Service")
    draw_external_entity(draw, 70, 700, 220, 130, code="e4", title="POS Staff")
    draw_external_entity(draw, 1820, 1120, 300, 130, code="e5", title="Admin / Manager")

    draw_process(
        draw,
        390,
        60,
        320,
        150,
        number="1.0",
        title="Manage Customer Order Request and Tracking",
        footer="Customer Ordering",
    )
    draw_process(
        draw,
        980,
        60,
        320,
        150,
        number="2.0",
        title="Create Order and Payment Record",
        footer="Ordering",
    )
    draw_process(
        draw,
        1220,
        410,
        340,
        150,
        number="3.0",
        title="Confirm Payment and Finalize Order",
        footer="Payment",
    )
    draw_process(
        draw,
        1220,
        800,
        340,
        170,
        number="4.0",
        title="Prepare, Release, and Deliver Order",
        footer="Operations",
    )
    draw_process(
        draw,
        430,
        1060,
        420,
        170,
        number="5.0",
        title="Manage Menu, Loyalty, Notifications, and Reports",
        footer="Administration",
    )

    draw_data_store(draw, 320, 455, 380, 72, code="D1", title="Orders and Order Items")
    draw_data_store(draw, 360, 1330, 420, 72, code="D2", title="Profiles and Loyalty Data")
    draw_data_store(draw, 930, 1330, 470, 72, code="D3", title="Menu, Inventory, and Voucher Data")

    # Customer to process 1 and back
    draw_poly_arrow(draw, [(290, 145), (390, 145)], end_direction="right")
    draw_label(draw, 300, 30, "Login data, menu request,\norder request")

    draw_poly_arrow(draw, [(390, 200), (290, 200)], end_direction="left")
    draw_label(draw, 300, 212, "Menu details,\nstatus and receipt")

    # Process 1 to process 2
    draw_poly_arrow(draw, [(710, 145), (980, 145)], end_direction="right")
    draw_label(draw, 760, 98, "Selected items,\norder details")

    # Order store interactions
    draw_poly_arrow(draw, [(1080, 210), (1080, 380), (510, 380), (510, 455)], end_direction="down")
    draw_label(draw, 760, 320, "Pending order\ndetails")

    draw_poly_arrow(draw, [(700, 491), (1220, 491)], end_direction="right")
    draw_label(draw, 865, 505, "Pending order\ndetails")

    # Process 2 to Maya and Process 3
    draw_poly_arrow(draw, [(1300, 145), (1640, 145), (1640, 155), (1880, 155)], end_direction="right")
    draw_label(draw, 1520, 98, "Checkout request")

    draw_poly_arrow(draw, [(1880, 200), (1720, 200), (1720, 485), (1560, 485)], end_direction="left")
    draw_label(draw, 1735, 330, "Payment result")

    draw_poly_arrow(draw, [(1300, 165), (1380, 165), (1380, 410)], end_direction="down")
    draw_label(draw, 1395, 260, "Order and\npayment details")

    # Process 3 confirm to D1
    draw_poly_arrow(draw, [(1220, 520), (700, 520)], end_direction="left")
    draw_label(draw, 915, 536, "Confirmed order")

    # D1 to Process 4
    draw_poly_arrow(draw, [(540, 527), (540, 885), (1220, 885)], end_direction="right")
    draw_label(draw, 570, 850, "Confirmed order\ndetails")

    # POS Staff to Process 4
    draw_poly_arrow(draw, [(290, 765), (500, 765), (500, 925), (1220, 925)], end_direction="right")
    draw_label(draw, 295, 712, "Preparation updates,\npickup confirmation")

    # Process 4 to Lalamove and back
    draw_poly_arrow(draw, [(1560, 855), (1720, 855), (1720, 695), (1880, 695)], end_direction="right")
    draw_label(draw, 1620, 790, "Delivery booking\nrequest")

    draw_poly_arrow(draw, [(1880, 740), (1700, 740), (1700, 940), (1560, 940)], end_direction="left")
    draw_label(draw, 1710, 835, "Shipment and\ndelivery status")

    # Process 4 to process 5
    draw_poly_arrow(draw, [(1220, 970), (930, 970), (930, 1145), (850, 1145)], end_direction="left")
    draw_label(draw, 940, 1000, "Completed order,\nsales, and status data")

    # Admin to process 5 and response
    draw_poly_arrow(draw, [(1820, 1180), (850, 1180)], end_direction="left")
    draw_label(draw, 1280, 1138, "Menu, inventory, voucher,\nand report requests")

    draw_poly_arrow(draw, [(850, 1220), (1820, 1220)], end_direction="right")
    draw_label(draw, 1250, 1232, "Reports, analytics,\nloyalty and inventory data")

    # Process 5 to stores
    draw_poly_arrow(draw, [(560, 1230), (560, 1330)], end_direction="down")
    draw_poly_arrow(draw, [(1080, 1230), (1080, 1330)], end_direction="down")
    draw_label(draw, 430, 1266, "Profile, loyalty,\nnotification data")
    draw_label(draw, 1125, 1266, "Menu, stock,\nvoucher data")

    image.save(OUTPUT_LEVEL1)


def main() -> None:
    create_level0()
    create_level1()
    print(f"WROTE={OUTPUT_LEVEL0}")
    print(f"WROTE={OUTPUT_LEVEL1}")


if __name__ == "__main__":
    main()
