from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


DOCS_DIR = Path(__file__).parent

BLACK = "#111111"
WHITE = "#ffffff"
HEADER = "#e9eef7"
HEADER_DARK = "#c9d8f0"
LINE = "#222222"
FIELD = "#fdfdfd"


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


FONT_TITLE = load_font(22, "bold")
FONT_ENTITY = load_font(18, "bold")
FONT_FIELD = load_font(14)
FONT_FIELD_BOLD = load_font(14, "bold")
FONT_LABEL = load_font(13, "italic")
FONT_CARD = load_font(12)


Box = tuple[int, int, int, int]


def text_size(draw: ImageDraw.ImageDraw, text: str, font) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def draw_center_text(draw: ImageDraw.ImageDraw, box: Box, text: str, font, fill: str = BLACK) -> None:
    x1, y1, x2, y2 = box
    width, height = text_size(draw, text, font)
    draw.text((x1 + (x2 - x1 - width) // 2, y1 + (y2 - y1 - height) // 2), text, font=font, fill=fill)


def draw_title(draw: ImageDraw.ImageDraw, title: str, width: int) -> None:
    draw_center_text(draw, (0, 25, width, 65), title, FONT_TITLE)


def draw_entity(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, title: str, fields: list[str]) -> Box:
    header_h = 34
    row_h = 24
    h = header_h + row_h * len(fields) + 12
    box = (x, y, x + w, y + h)
    draw.rectangle(box, fill=WHITE, outline=BLACK, width=2)
    draw.rectangle((x, y, x + w, y + header_h), fill=HEADER, outline=BLACK, width=2)
    draw_center_text(draw, (x, y, x + w, y + header_h), title, FONT_ENTITY)

    current_y = y + header_h + 8
    for field in fields:
        is_key = field.startswith("PK ") or field.startswith("FK ") or field.startswith("PK/FK ")
        font = FONT_FIELD_BOLD if is_key else FONT_FIELD
        draw.text((x + 12, current_y), field, font=font, fill=BLACK)
        current_y += row_h
    return box


def anchor(box: Box, side: str) -> tuple[int, int]:
    x1, y1, x2, y2 = box
    if side == "left":
        return x1, (y1 + y2) // 2
    if side == "right":
        return x2, (y1 + y2) // 2
    if side == "top":
        return (x1 + x2) // 2, y1
    return (x1 + x2) // 2, y2


def draw_label(draw: ImageDraw.ImageDraw, x: int, y: int, text: str) -> None:
    if not text:
        return
    width, height = text_size(draw, text, FONT_LABEL)
    pad = 4
    draw.rectangle((x - pad, y - pad, x + width + pad, y + height + pad), fill=WHITE)
    draw.text((x, y), text, font=FONT_LABEL, fill=BLACK)


def draw_cardinality(draw: ImageDraw.ImageDraw, point: tuple[int, int], text: str, dx: int = 0, dy: int = 0) -> None:
    if not text:
        return
    draw.text((point[0] + dx, point[1] + dy), text, font=FONT_CARD, fill=BLACK)


def connect(
    draw: ImageDraw.ImageDraw,
    boxes: dict[str, Box],
    a: str,
    a_side: str,
    b: str,
    b_side: str,
    *,
    label: str = "",
    a_card: str = "1",
    b_card: str = "0..*",
    via: list[tuple[int, int]] | None = None,
) -> None:
    start = anchor(boxes[a], a_side)
    end = anchor(boxes[b], b_side)
    points = [start] + (via or []) + [end]
    draw.line(points, fill=LINE, width=2)
    draw_cardinality(draw, start, a_card, 6 if a_side == "right" else -22, -18)
    draw_cardinality(draw, end, b_card, -34 if b_side == "left" else 8, 4)

    if label:
        mid = points[len(points) // 2]
        draw_label(draw, mid[0] + 8, mid[1] - 18, label)


def save(image: Image.Image, filename: str) -> None:
    image.save(DOCS_DIR / filename)


def figure_overall() -> None:
    image = Image.new("RGB", (2200, 1650), WHITE)
    draw = ImageDraw.Draw(image)
    draw_title(draw, "Overall ERD of the Proposed Jayd's Cafe Ordering and Operations System", 2200)
    boxes: dict[str, Box] = {}

    boxes["AUTH_USERS"] = draw_entity(draw, 70, 110, 260, "AUTH_USERS", ["PK id", "email"])
    boxes["PROFILES"] = draw_entity(draw, 70, 270, 260, "PROFILES", ["PK/FK id", "email", "role", "points", "loyalty_tier"])
    boxes["STAFF"] = draw_entity(draw, 70, 550, 260, "STAFF LOGS", ["PK id", "FK staff_id", "clock_in", "clock_out", "total_sales"])
    boxes["ADDRESSES"] = draw_entity(draw, 70, 820, 260, "SAVED_ADDRESSES", ["PK id", "FK user_id", "label", "address", "lat", "lng"])
    boxes["NOTIFICATIONS"] = draw_entity(draw, 70, 1080, 260, "NOTIFICATIONS", ["PK id", "FK user_id", "title", "type", "is_read"])

    boxes["CATEGORIES"] = draw_entity(draw, 480, 120, 270, "CATEGORIES", ["PK id", "name", "sort_order", "status"])
    boxes["MENU_ITEMS"] = draw_entity(draw, 480, 320, 270, "MENU_ITEMS", ["PK id", "FK category_id", "name", "price", "is_available", "prep_time"])
    boxes["ITEM_VARIANTS"] = draw_entity(draw, 480, 600, 270, "ITEM_VARIANTS", ["PK id", "FK menu_item_id", "variant_group", "label", "price_modifier"])
    boxes["INGREDIENTS"] = draw_entity(draw, 480, 900, 270, "INGREDIENTS", ["PK id", "name", "unit", "current_stock", "min_stock_alert"])
    boxes["RECIPE"] = draw_entity(draw, 830, 710, 300, "MENU_ITEM_INGREDIENTS", ["PK id", "FK menu_item_id", "FK ingredient_id", "quantity_used"])
    boxes["VARIANT_RECIPE"] = draw_entity(draw, 830, 980, 300, "VARIANT_INGREDIENTS", ["PK id", "variant_label", "variant_group", "FK ingredient_id"])
    boxes["INVENTORY_LOGS"] = draw_entity(draw, 830, 1260, 300, "INVENTORY_LOGS", ["PK id", "FK ingredient_id", "FK order_id", "FK staff_id", "change_amount"])

    boxes["ORDERS"] = draw_entity(draw, 1240, 230, 330, "ORDERS", ["PK id", "order_number", "FK customer_id", "FK staff_id", "status", "payment_status", "total"])
    boxes["ORDER_ITEMS"] = draw_entity(draw, 1240, 570, 330, "ORDER_ITEMS", ["PK id", "FK order_id", "FK menu_item_id", "name", "quantity", "subtotal"])
    boxes["ORDER_HISTORY"] = draw_entity(draw, 1660, 390, 340, "ORDER_STATUS_HISTORY", ["PK id", "FK order_id", "FK changed_by", "previous_status", "new_status"])
    boxes["FULFILLMENT"] = draw_entity(draw, 1660, 700, 340, "PICKUP / RECEIPTS", ["PK id", "FK order_id", "token_hash", "receipt_token", "is_used"])
    boxes["VOUCHERS"] = draw_entity(draw, 1240, 930, 330, "VOUCHERS", ["PK id", "code", "discount_type", "discount_value", "is_active"])
    boxes["CLAIMS"] = draw_entity(draw, 1660, 1020, 340, "VOUCHER_CLAIMS", ["PK id", "FK voucher_id", "FK user_id", "FK order_id", "claimed_at"])
    boxes["VOID"] = draw_entity(draw, 1660, 1280, 340, "VOID / SETTINGS", ["PK id", "FK order_id", "FK staff_id", "void_pin", "created_at"])

    connect(draw, boxes, "AUTH_USERS", "bottom", "PROFILES", "top", label="owns", b_card="1")
    connect(draw, boxes, "PROFILES", "right", "ORDERS", "left", label="customer/staff")
    connect(draw, boxes, "PROFILES", "bottom", "STAFF", "top", label="staff logs")
    connect(draw, boxes, "AUTH_USERS", "right", "ADDRESSES", "left", label="saved addresses", via=[(390, 180), (390, 900)])
    connect(draw, boxes, "AUTH_USERS", "right", "NOTIFICATIONS", "left", label="notifications", via=[(420, 180), (420, 1160)])

    connect(draw, boxes, "CATEGORIES", "bottom", "MENU_ITEMS", "top", label="contains")
    connect(draw, boxes, "MENU_ITEMS", "bottom", "ITEM_VARIANTS", "top", label="variants")
    connect(draw, boxes, "MENU_ITEMS", "right", "RECIPE", "left", label="recipe")
    connect(draw, boxes, "INGREDIENTS", "right", "RECIPE", "left", label="used by")
    connect(draw, boxes, "INGREDIENTS", "right", "VARIANT_RECIPE", "left", label="add-on usage")
    connect(draw, boxes, "INGREDIENTS", "right", "INVENTORY_LOGS", "left", label="stock log")

    connect(draw, boxes, "ORDERS", "bottom", "ORDER_ITEMS", "top", label="includes", b_card="1..*")
    connect(draw, boxes, "MENU_ITEMS", "right", "ORDER_ITEMS", "left", label="ordered as", via=[(920, 470), (920, 670)])
    connect(draw, boxes, "ORDERS", "right", "ORDER_HISTORY", "left", label="status history")
    connect(draw, boxes, "ORDERS", "right", "FULFILLMENT", "left", label="pickup/receipt")
    connect(draw, boxes, "ORDERS", "bottom", "CLAIMS", "left", label="voucher use", via=[(1410, 850), (1580, 850), (1580, 1110)])
    connect(draw, boxes, "VOUCHERS", "right", "CLAIMS", "left", label="claims")
    connect(draw, boxes, "ORDERS", "right", "VOID", "left", label="void audit", via=[(1620, 380), (1620, 1360)])
    connect(draw, boxes, "PROFILES", "right", "VOID", "left", label="staff audit", via=[(370, 390), (370, 1530), (1580, 1530), (1580, 1360)])

    save(image, "erd_overall.png")


def figure_user_loyalty() -> None:
    image = Image.new("RGB", (1600, 1000), WHITE)
    draw = ImageDraw.Draw(image)
    draw_title(draw, "User, Staff, Loyalty, and Notification ERD", 1600)
    boxes: dict[str, Box] = {}
    boxes["AUTH_USERS"] = draw_entity(draw, 80, 120, 300, "AUTH_USERS", ["PK id", "email"])
    boxes["PROFILES"] = draw_entity(draw, 540, 120, 360, "PROFILES", ["PK/FK id", "email", "full_name", "role", "phone", "points", "total_orders", "loyalty_tier", "total_spent"])
    boxes["LOYALTY_TIERS"] = draw_entity(draw, 1060, 120, 360, "LOYALTY_TIERS", ["PK id", "name", "min_points", "color", "perks"])
    boxes["NOTIFICATIONS"] = draw_entity(draw, 80, 560, 360, "NOTIFICATIONS", ["PK id", "FK user_id", "title", "body", "type", "is_read"])
    boxes["SHIFTS"] = draw_entity(draw, 610, 560, 320, "SHIFTS", ["PK id", "FK staff_id", "clock_in", "clock_out", "orders_handled"])
    boxes["CLOCK"] = draw_entity(draw, 1080, 560, 320, "CLOCK_ENTRIES", ["PK id", "FK staff_id", "clock_in", "clock_out", "total_hours"])

    connect(draw, boxes, "AUTH_USERS", "right", "PROFILES", "left", label="owns", b_card="1")
    connect(draw, boxes, "AUTH_USERS", "bottom", "NOTIFICATIONS", "top", label="receives")
    connect(draw, boxes, "PROFILES", "bottom", "SHIFTS", "top", label="works")
    connect(draw, boxes, "PROFILES", "right", "CLOCK", "top", label="logs", via=[(980, 250), (1240, 250)])
    draw_label(draw, 980, 215, "loyalty_tier is text-based")
    draw.line([anchor(boxes["PROFILES"], "right"), anchor(boxes["LOYALTY_TIERS"], "left")], fill="#666666", width=1)
    save(image, "erd_user_loyalty.png")


def figure_menu_inventory() -> None:
    image = Image.new("RGB", (1800, 1200), WHITE)
    draw = ImageDraw.Draw(image)
    draw_title(draw, "Menu, Variants, Recipes, and Inventory ERD", 1800)
    boxes: dict[str, Box] = {}
    boxes["CATEGORIES"] = draw_entity(draw, 80, 120, 320, "CATEGORIES", ["PK id", "name", "sort_order", "is_active", "status"])
    boxes["MENU_ITEMS"] = draw_entity(draw, 560, 120, 360, "MENU_ITEMS", ["PK id", "FK category_id", "name", "price", "is_available", "prep_time", "recipe_required"])
    boxes["ITEM_VARIANTS"] = draw_entity(draw, 1120, 120, 360, "ITEM_VARIANTS", ["PK id", "FK menu_item_id", "variant_group", "label", "price_modifier", "applicable_items"])
    boxes["INGREDIENTS"] = draw_entity(draw, 560, 600, 360, "INGREDIENTS", ["PK id", "name", "unit", "current_stock", "min_stock_alert", "cost_per_unit"])
    boxes["RECIPE"] = draw_entity(draw, 80, 610, 360, "MENU_ITEM_INGREDIENTS", ["PK id", "FK menu_item_id", "FK ingredient_id", "quantity_used", "size_multipliers"])
    boxes["VARIANT_RECIPE"] = draw_entity(draw, 1120, 610, 360, "VARIANT_INGREDIENTS", ["PK id", "variant_label", "variant_group", "FK ingredient_id", "replaces_ingredient_id", "quantity_used"])
    boxes["INVENTORY_LOGS"] = draw_entity(draw, 560, 910, 360, "INVENTORY_LOGS", ["PK id", "FK ingredient_id", "FK order_id", "FK staff_id", "change_amount", "stock_after"])

    connect(draw, boxes, "CATEGORIES", "right", "MENU_ITEMS", "left", label="contains")
    connect(draw, boxes, "MENU_ITEMS", "right", "ITEM_VARIANTS", "left", label="has")
    connect(draw, boxes, "MENU_ITEMS", "left", "RECIPE", "top", label="requires", via=[(500, 240), (500, 560), (260, 560)])
    connect(draw, boxes, "INGREDIENTS", "left", "RECIPE", "right", label="supplies")
    connect(draw, boxes, "INGREDIENTS", "right", "VARIANT_RECIPE", "left", label="supplies")
    connect(draw, boxes, "INGREDIENTS", "bottom", "INVENTORY_LOGS", "top", label="tracked by")
    save(image, "erd_menu_inventory.png")


def figure_ordering() -> None:
    image = Image.new("RGB", (2000, 1250), WHITE)
    draw = ImageDraw.Draw(image)
    draw_title(draw, "Ordering, Payment, Pickup, and Delivery ERD", 2000)
    boxes: dict[str, Box] = {}
    boxes["PROFILES"] = draw_entity(draw, 80, 150, 330, "PROFILES", ["PK id", "email", "full_name", "role", "phone"])
    boxes["ORDERS"] = draw_entity(draw, 620, 120, 430, "ORDERS", ["PK id", "order_number", "FK customer_id", "FK staff_id", "status", "order_type", "payment_method", "payment_status", "maya_checkout_id", "delivery fields", "lalamove fields", "total"])
    boxes["ORDER_ITEMS"] = draw_entity(draw, 1280, 120, 360, "ORDER_ITEMS", ["PK id", "FK order_id", "FK menu_item_id", "name", "price", "quantity", "variants", "subtotal"])
    boxes["MENU_ITEMS"] = draw_entity(draw, 1280, 500, 360, "MENU_ITEMS", ["PK id", "FK category_id", "name", "price", "is_available"])
    boxes["HISTORY"] = draw_entity(draw, 620, 640, 430, "ORDER_STATUS_HISTORY", ["PK id", "FK order_id", "previous_status", "new_status", "FK changed_by", "notes"])
    boxes["TOKENS"] = draw_entity(draw, 80, 650, 330, "PICKUP_TOKENS", ["PK id", "FK order_id", "token_hash", "is_used"])
    boxes["RECEIPTS"] = draw_entity(draw, 80, 900, 330, "GUEST_RECEIPTS", ["PK id", "FK order_id", "receipt_token", "receipt_data", "expires_at"])
    boxes["ADDRESSES"] = draw_entity(draw, 1280, 850, 360, "SAVED_ADDRESSES", ["PK id", "FK user_id", "label", "address", "lat", "lng"])

    connect(draw, boxes, "PROFILES", "right", "ORDERS", "left", label="customer/staff")
    connect(draw, boxes, "ORDERS", "right", "ORDER_ITEMS", "left", label="includes", b_card="1..*")
    connect(draw, boxes, "MENU_ITEMS", "top", "ORDER_ITEMS", "bottom", label="ordered item")
    connect(draw, boxes, "ORDERS", "bottom", "HISTORY", "top", label="status history")
    connect(draw, boxes, "ORDERS", "left", "TOKENS", "right", label="pickup token", b_card="0..1")
    connect(draw, boxes, "ORDERS", "left", "RECEIPTS", "right", label="guest receipt", via=[(520, 300), (520, 970)])
    connect(draw, boxes, "PROFILES", "right", "ADDRESSES", "left", label="saved address", via=[(480, 260), (480, 1110), (1200, 1110)])
    save(image, "erd_ordering.png")


def figure_vouchers() -> None:
    image = Image.new("RGB", (1700, 1050), WHITE)
    draw = ImageDraw.Draw(image)
    draw_title(draw, "Vouchers, Claims, Promotions, and Notifications ERD", 1700)
    boxes: dict[str, Box] = {}
    boxes["AUTH_USERS"] = draw_entity(draw, 80, 130, 300, "AUTH_USERS", ["PK id", "email"])
    boxes["VOUCHERS"] = draw_entity(draw, 580, 110, 420, "VOUCHERS", ["PK id", "code", "discount_type", "discount_value", "min_order_amount", "target_tier", "target_users", "applicable_item_ids", "application_mode"])
    boxes["CLAIMS"] = draw_entity(draw, 1160, 150, 360, "VOUCHER_CLAIMS", ["PK id", "FK voucher_id", "FK user_id", "FK order_id", "claimed_at", "used_at"])
    boxes["ORDERS"] = draw_entity(draw, 1160, 600, 360, "ORDERS", ["PK id", "order_number", "FK customer_id", "status", "total"])
    boxes["NOTIFICATIONS"] = draw_entity(draw, 80, 600, 360, "NOTIFICATIONS", ["PK id", "FK user_id", "title", "body", "type", "is_read", "data"])

    connect(draw, boxes, "VOUCHERS", "right", "CLAIMS", "left", label="claimed as")
    connect(draw, boxes, "AUTH_USERS", "right", "CLAIMS", "left", label="claims", via=[(460, 210), (460, 420), (1120, 420)])
    connect(draw, boxes, "ORDERS", "top", "CLAIMS", "bottom", label="applied to")
    connect(draw, boxes, "AUTH_USERS", "bottom", "NOTIFICATIONS", "top", label="receives")
    save(image, "erd_vouchers_notifications.png")


def figure_admin_audit() -> None:
    image = Image.new("RGB", (1600, 950), WHITE)
    draw = ImageDraw.Draw(image)
    draw_title(draw, "Admin, Void, and Audit ERD", 1600)
    boxes: dict[str, Box] = {}
    boxes["PROFILES"] = draw_entity(draw, 90, 150, 340, "PROFILES", ["PK id", "email", "full_name", "role"])
    boxes["ORDERS"] = draw_entity(draw, 620, 150, 340, "ORDERS", ["PK id", "order_number", "status", "payment_status", "total"])
    boxes["VOID_LOGS"] = draw_entity(draw, 1130, 140, 340, "VOID_LOGS", ["PK id", "FK order_id", "FK staff_id", "created_at"])
    boxes["VOID_TOKENS"] = draw_entity(draw, 620, 560, 340, "VOID_TOKENS", ["PK id", "token_hash", "FK created_by", "FK used_by", "FK order_id", "is_used", "expires_at"])
    boxes["SETTINGS"] = draw_entity(draw, 90, 590, 340, "STORE_SETTINGS", ["PK id", "void_pin", "updated_at"])

    connect(draw, boxes, "PROFILES", "right", "VOID_LOGS", "left", label="staff")
    connect(draw, boxes, "ORDERS", "right", "VOID_LOGS", "left", label="voided order")
    connect(draw, boxes, "PROFILES", "right", "VOID_TOKENS", "left", label="creates/uses", via=[(520, 260), (520, 650)])
    connect(draw, boxes, "ORDERS", "bottom", "VOID_TOKENS", "top", label="linked order", b_card="0..*")
    save(image, "erd_admin_audit.png")


def main() -> None:
    figure_overall()
    figure_user_loyalty()
    figure_menu_inventory()
    figure_ordering()
    figure_vouchers()
    figure_admin_audit()
    for filename in [
        "erd_overall.png",
        "erd_user_loyalty.png",
        "erd_menu_inventory.png",
        "erd_ordering.png",
        "erd_vouchers_notifications.png",
        "erd_admin_audit.png",
    ]:
        print(f"WROTE={DOCS_DIR / filename}")


if __name__ == "__main__":
    main()
