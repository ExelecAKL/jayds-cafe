from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


DOCS_DIR = Path(__file__).parent
OUTPUT_PATH = DOCS_DIR / "erd_authentication_access.png"

BLACK = "#111111"
WHITE = "#ffffff"
GRID = "#d9d9d9"


def font_path(name: str) -> str | None:
    candidates = {
        "regular": [r"C:\Windows\Fonts\arial.ttf", r"C:\Windows\Fonts\Arial.ttf"],
        "bold": [r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\Arialbd.ttf"],
        "italic": [r"C:\Windows\Fonts\ariali.ttf", r"C:\Windows\Fonts\Ariali.ttf"],
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


FONT_TITLE = load_font(30, "bold")
FONT_TABLE = load_font(22, "bold")
FONT_FIELD = load_font(16, "bold")
FONT_KEY = load_font(15, "bold")
FONT_NOTE = load_font(16, "italic")

Row = tuple[str, str]
Box = tuple[int, int, int, int]


def text_size(draw: ImageDraw.ImageDraw, text: str, font) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def center_text(draw: ImageDraw.ImageDraw, box: Box, text: str, font) -> None:
    x1, y1, x2, y2 = box
    w, h = text_size(draw, text, font)
    draw.text((x1 + (x2 - x1 - w) // 2, y1 + (y2 - y1 - h) // 2), text, font=font, fill=BLACK)


def draw_title(draw: ImageDraw.ImageDraw, title: str, width: int) -> None:
    center_text(draw, (0, 20, width, 70), title, FONT_TITLE)


def draw_table(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, title: str, rows: list[Row]) -> Box:
    header_h = 40
    row_h = 32
    key_w = 68
    h = header_h + row_h * len(rows)

    draw.rectangle((x, y, x + w, y + h), fill=WHITE, outline=BLACK, width=3)
    draw.line((x, y + header_h, x + w, y + header_h), fill=BLACK, width=3)
    draw.line((x + key_w, y + header_h, x + key_w, y + h), fill=BLACK, width=2)
    center_text(draw, (x, y, x + w, y + header_h), title, FONT_TABLE)

    for index, (key, field) in enumerate(rows):
        row_y = y + header_h + index * row_h
        if index > 0:
            draw.line((x, row_y, x + w, row_y), fill=GRID, width=1)
        if key:
            draw.text((x + 12, row_y + 8), key, font=FONT_KEY, fill=BLACK)
        draw.text((x + key_w + 14, row_y + 8), field, font=FONT_FIELD, fill=BLACK)
        if key:
            text_w, _ = text_size(draw, field, FONT_FIELD)
            underline_y = row_y + 27
            draw.line((x + key_w + 14, underline_y, x + key_w + 14 + text_w, underline_y), fill=BLACK, width=1)

    return (x, y, x + w, y + h)


def anchor(box: Box, side: str, ratio: float = 0.5) -> tuple[int, int]:
    x1, y1, x2, y2 = box
    if side == "left":
        return x1, int(y1 + (y2 - y1) * ratio)
    if side == "right":
        return x2, int(y1 + (y2 - y1) * ratio)
    if side == "top":
        return int(x1 + (x2 - x1) * ratio), y1
    return int(x1 + (x2 - x1) * ratio), y2


def endpoint_direction(side: str) -> tuple[int, int]:
    if side == "left":
        return (-1, 0)
    if side == "right":
        return (1, 0)
    if side == "top":
        return (0, -1)
    return (0, 1)


def draw_one(draw: ImageDraw.ImageDraw, point: tuple[int, int], side: str) -> None:
    x, y = point
    dx, dy = endpoint_direction(side)
    if dx:
        draw.line((x + dx * 8, y - 13, x + dx * 8, y + 13), fill=BLACK, width=3)
        draw.line((x + dx * 14, y - 13, x + dx * 14, y + 13), fill=BLACK, width=3)
    else:
        draw.line((x - 13, y + dy * 8, x + 13, y + dy * 8), fill=BLACK, width=3)
        draw.line((x - 13, y + dy * 14, x + 13, y + dy * 14), fill=BLACK, width=3)


def draw_zero(draw: ImageDraw.ImageDraw, point: tuple[int, int], side: str) -> None:
    x, y = point
    dx, dy = endpoint_direction(side)
    cx = x + dx * 18
    cy = y + dy * 18
    draw.ellipse((cx - 7, cy - 7, cx + 7, cy + 7), fill=WHITE, outline=BLACK, width=2)


def draw_many(draw: ImageDraw.ImageDraw, point: tuple[int, int], side: str) -> None:
    x, y = point
    dx, dy = endpoint_direction(side)
    if dx:
        base_x = x + dx * 20
        draw.line((x, y, base_x, y), fill=BLACK, width=3)
        draw.line((x, y, base_x, y - 14), fill=BLACK, width=3)
        draw.line((x, y, base_x, y + 14), fill=BLACK, width=3)
    else:
        base_y = y + dy * 20
        draw.line((x, y, x, base_y), fill=BLACK, width=3)
        draw.line((x, y, x - 14, base_y), fill=BLACK, width=3)
        draw.line((x, y, x + 14, base_y), fill=BLACK, width=3)


def draw_endpoint(draw: ImageDraw.ImageDraw, point: tuple[int, int], side: str, cardinality: str) -> None:
    if cardinality == "one":
        draw_one(draw, point, side)
    elif cardinality == "zero_many":
        draw_zero(draw, point, side)
        draw_many(draw, point, side)
    elif cardinality == "one_many":
        draw_one(draw, point, side)
        draw_many(draw, point, side)
    elif cardinality == "zero_one":
        draw_zero(draw, point, side)
        draw_one(draw, point, side)


def draw_label(draw: ImageDraw.ImageDraw, x: int, y: int, text: str) -> None:
    if not text:
        return
    w, h = text_size(draw, text, FONT_NOTE)
    draw.rectangle((x - 6, y - 4, x + w + 6, y + h + 4), fill=WHITE)
    draw.text((x, y), text, font=FONT_NOTE, fill=BLACK)


def connect(
    draw: ImageDraw.ImageDraw,
    boxes: dict[str, Box],
    start_name: str,
    start_side: str,
    end_name: str,
    end_side: str,
    *,
    start_ratio: float = 0.5,
    end_ratio: float = 0.5,
    start_cardinality: str = "one",
    end_cardinality: str = "zero_many",
    label: str = "",
    via: list[tuple[int, int]] | None = None,
    label_at: tuple[int, int] | None = None,
) -> None:
    start = anchor(boxes[start_name], start_side, start_ratio)
    end = anchor(boxes[end_name], end_side, end_ratio)
    points = [start] + (via or []) + [end]
    draw.line(points, fill=BLACK, width=3)
    draw_endpoint(draw, start, start_side, start_cardinality)
    draw_endpoint(draw, end, end_side, end_cardinality)
    if label_at:
        draw_label(draw, label_at[0], label_at[1], label)


def main() -> None:
    image = Image.new("RGB", (1900, 1300), WHITE)
    draw = ImageDraw.Draw(image)
    draw_title(draw, "AUTHENTICATION AND USER ACCESS ERD", 1900)

    boxes: dict[str, Box] = {}
    boxes["AUTH_USERS"] = draw_table(
        draw,
        70,
        390,
        360,
        "AUTH_USERS",
        [
            ("PK", "id"),
            ("", "email"),
            ("", "auth_credentials"),
            ("", "created_at"),
            ("", "updated_at"),
        ],
    )

    boxes["PROFILES"] = draw_table(
        draw,
        600,
        235,
        400,
        "PROFILES",
        [
            ("PK", "id"),
            ("FK", "id"),
            ("", "email"),
            ("", "full_name"),
            ("", "role"),
            ("", "avatar_url"),
            ("", "phone"),
            ("", "points"),
            ("", "total_orders"),
            ("", "loyalty_tier"),
            ("", "created_at"),
            ("", "updated_at"),
        ],
    )

    boxes["SAVED_ADDRESSES"] = draw_table(
        draw,
        70,
        760,
        360,
        "SAVED_ADDRESSES",
        [
            ("PK", "id"),
            ("FK", "user_id"),
            ("", "label"),
            ("", "address"),
            ("", "lat"),
            ("", "lng"),
            ("", "created_at"),
        ],
    )

    boxes["NOTIFICATIONS"] = draw_table(
        draw,
        1180,
        95,
        390,
        "NOTIFICATIONS",
        [
            ("PK", "id"),
            ("FK", "user_id"),
            ("", "title"),
            ("", "body"),
            ("", "type"),
            ("", "is_read"),
            ("", "created_at"),
        ],
    )

    boxes["ORDERS"] = draw_table(
        draw,
        1180,
        395,
        390,
        "ORDERS",
        [
            ("PK", "id"),
            ("FK", "customer_id"),
            ("FK", "staff_id"),
            ("", "order_number"),
            ("", "status"),
            ("", "payment_status"),
            ("", "total"),
            ("", "created_at"),
        ],
    )

    boxes["ORDER_STATUS_HISTORY"] = draw_table(
        draw,
        1180,
        740,
        390,
        "ORDER_STATUS_HISTORY",
        [
            ("PK", "id"),
            ("FK", "order_id"),
            ("FK", "changed_by"),
            ("", "previous_status"),
            ("", "new_status"),
            ("", "created_at"),
        ],
    )

    boxes["VOUCHER_CLAIMS"] = draw_table(
        draw,
        600,
        760,
        400,
        "VOUCHER_CLAIMS",
        [
            ("PK", "id"),
            ("FK", "user_id"),
            ("FK", "voucher_id"),
            ("FK", "order_id"),
            ("", "claimed_at"),
            ("", "used_at"),
        ],
    )

    boxes["CLOCK_ENTRIES"] = draw_table(
        draw,
        1180,
        980,
        390,
        "CLOCK_ENTRIES",
        [
            ("PK", "id"),
            ("FK", "staff_id"),
            ("", "clock_in"),
            ("", "clock_out"),
            ("", "total_hours"),
        ],
    )

    connect(
        draw,
        boxes,
        "AUTH_USERS",
        "right",
        "PROFILES",
        "left",
        start_cardinality="one",
        end_cardinality="one",
        label="one account has one profile",
        label_at=(465, 430),
    )
    connect(
        draw,
        boxes,
        "AUTH_USERS",
        "bottom",
        "SAVED_ADDRESSES",
        "top",
        start_ratio=0.48,
        end_ratio=0.48,
        start_cardinality="one",
        end_cardinality="zero_many",
        label="saved addresses",
        label_at=(235, 670),
        via=[(243, 650)],
    )
    connect(
        draw,
        boxes,
        "AUTH_USERS",
        "right",
        "NOTIFICATIONS",
        "left",
        start_ratio=0.18,
        end_ratio=0.55,
        start_cardinality="one",
        end_cardinality="zero_many",
        label="notifications",
        label_at=(740, 120),
        via=[(500, 425), (500, 180), (1120, 180)],
    )
    connect(
        draw,
        boxes,
        "AUTH_USERS",
        "right",
        "VOUCHER_CLAIMS",
        "left",
        start_ratio=0.82,
        end_ratio=0.50,
        start_cardinality="one",
        end_cardinality="zero_many",
        label="voucher claims",
        label_at=(460, 860),
        via=[(500, 555), (500, 865)],
    )
    connect(
        draw,
        boxes,
        "PROFILES",
        "right",
        "ORDERS",
        "left",
        start_ratio=0.45,
        end_ratio=0.35,
        start_cardinality="one",
        end_cardinality="zero_many",
        label="customer_id / staff_id",
        label_at=(1025, 420),
    )
    connect(
        draw,
        boxes,
        "PROFILES",
        "right",
        "ORDER_STATUS_HISTORY",
        "left",
        start_ratio=0.74,
        end_ratio=0.42,
        start_cardinality="one",
        end_cardinality="zero_many",
        label="changed_by",
        label_at=(1060, 765),
        via=[(1090, 575), (1090, 835)],
    )
    connect(
        draw,
        boxes,
        "PROFILES",
        "bottom",
        "CLOCK_ENTRIES",
        "left",
        start_ratio=0.76,
        end_ratio=0.35,
        start_cardinality="one",
        end_cardinality="zero_many",
        label="staff_id",
        label_at=(1030, 1015),
        via=[(905, 700), (1090, 700), (1090, 1045)],
    )
    connect(
        draw,
        boxes,
        "ORDERS",
        "bottom",
        "ORDER_STATUS_HISTORY",
        "top",
        start_ratio=0.50,
        end_ratio=0.50,
        start_cardinality="one",
        end_cardinality="zero_many",
        label="order history",
        label_at=(1330, 685),
    )

    image.save(OUTPUT_PATH)
    print(f"WROTE={OUTPUT_PATH}")


if __name__ == "__main__":
    main()
