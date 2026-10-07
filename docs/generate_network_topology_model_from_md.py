from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


DOCS_DIR = Path(__file__).parent
TOPOLOGY_OUTPUT = DOCS_DIR / "chapter3_network_topology_cloud_star.png"
MODEL_OUTPUT = DOCS_DIR / "chapter3_network_model_tcpip_stack.png"

BLACK = "#111111"
BLUE = "#d9edf7"
BLUE_BORDER = "#01579b"
YELLOW = "#fff2cc"
YELLOW_BORDER = "#bf9000"
PINK = "#fce4ec"
PINK_BORDER = "#c62828"
GREEN = "#e2f0d9"
GREEN_BORDER = "#2e7d32"
LIGHT_GRAY = "#f7f7f7"


def font_path(kind: str) -> str | None:
    candidates = {
        "regular": [r"C:\Windows\Fonts\arial.ttf", r"C:\Windows\Fonts\Arial.ttf"],
        "bold": [r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\Arialbd.ttf"],
    }
    for candidate in candidates[kind]:
        path = Path(candidate)
        if path.exists():
            return str(path)
    return None


def load_font(size: int, kind: str = "regular") -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = font_path(kind)
    if path:
        return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


TITLE = load_font(34, "bold")
NODE = load_font(25, "bold")
SMALL = load_font(20)
SMALL_BOLD = load_font(20, "bold")
TINY = load_font(17)


def text_size(draw: ImageDraw.ImageDraw, text: str, font) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0], box[3] - box[1]


def wrap(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    lines: list[str] = []
    for part in text.splitlines():
        words = part.split()
        if not words:
            lines.append("")
            continue
        current = words[0]
        for word in words[1:]:
            trial = f"{current} {word}"
            if text_size(draw, trial, font)[0] <= max_width:
                current = trial
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines


def centered(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    text: str,
    font,
    fill: str = BLACK,
    max_width_pad: int = 24,
) -> None:
    lines = wrap(draw, text, font, box[2] - box[0] - max_width_pad)
    sizes = [text_size(draw, line, font) for line in lines]
    total_h = sum(h for _, h in sizes) + max(0, len(lines) - 1) * 5
    y = box[1] + (box[3] - box[1] - total_h) // 2
    for line, (width, height) in zip(lines, sizes):
        draw.text((box[0] + (box[2] - box[0] - width) // 2, y), line, font=font, fill=fill)
        y += height + 5


def draw_box(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    title: str,
    subtitle: str,
    fill: str,
    outline: str,
) -> None:
    draw.rounded_rectangle(box, radius=22, fill=fill, outline=outline, width=4)
    x1, y1, x2, y2 = box
    centered(draw, (x1 + 10, y1 + 15, x2 - 10, y1 + 60), title, NODE)
    centered(draw, (x1 + 10, y1 + 65, x2 - 10, y2 - 12), subtitle, SMALL)


def arrow_head(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], color: str = BLACK) -> None:
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    length = 18
    spread = math.radians(28)
    points = [end]
    for sign in (1, -1):
        theta = angle + math.pi + sign * spread
        points.append((int(end[0] + length * math.cos(theta)), int(end[1] + length * math.sin(theta))))
    draw.polygon(points, fill=color)


def connector(
    draw: ImageDraw.ImageDraw,
    start: tuple[int, int],
    end: tuple[int, int],
    label: str,
    label_pos: tuple[int, int],
    bidirectional: bool = True,
) -> None:
    draw.line((start, end), fill=BLACK, width=3)
    arrow_head(draw, start, end)
    if bidirectional:
        arrow_head(draw, end, start)

    lines = wrap(draw, label, SMALL_BOLD, 260)
    sizes = [text_size(draw, line, SMALL_BOLD) for line in lines]
    width = max(w for w, _ in sizes) + 18
    height = sum(h for _, h in sizes) + max(0, len(lines) - 1) * 3 + 12
    x, y = label_pos
    draw.rounded_rectangle((x - width // 2, y - height // 2, x + width // 2, y + height // 2), radius=8, fill="white")
    text_y = y - height // 2 + 6
    for line, (line_w, line_h) in zip(lines, sizes):
        draw.text((x - line_w // 2, text_y), line, font=SMALL_BOLD, fill=BLACK)
        text_y += line_h + 3


def render_topology() -> None:
    image = Image.new("RGB", (1600, 980), "white")
    draw = ImageDraw.Draw(image)
    centered(draw, (0, 25, 1600, 80), "CafeOS Network Topology: Cloud-Centric Star", TITLE)

    supabase = (660, 380, 1020, 560)
    vercel = (660, 110, 1020, 250)
    customer = (80, 210, 410, 350)
    pos = (80, 420, 410, 560)
    admin = (80, 630, 410, 770)
    maya = (1190, 305, 1520, 445)
    lalamove = (1190, 535, 1520, 675)

    draw_box(draw, supabase, "Supabase Cloud", "PostgreSQL + Auth + Realtime", YELLOW, YELLOW_BORDER)
    draw_box(draw, vercel, "Vercel Edge Network", "CDN + SSR / Serverless Routes", GREEN, GREEN_BORDER)
    draw_box(draw, customer, "Customer Mobile Device", "Progressive Web App", BLUE, BLUE_BORDER)
    draw_box(draw, pos, "POS Terminal", "In-store browser interface", BLUE, BLUE_BORDER)
    draw_box(draw, admin, "Admin Dashboard", "Management browser portal", BLUE, BLUE_BORDER)
    draw_box(draw, maya, "Maya Payment Gateway", "Online checkout service", PINK, PINK_BORDER)
    draw_box(draw, lalamove, "Lalamove Delivery API", "Delivery quotation and dispatch", PINK, PINK_BORDER)

    connector(draw, (410, 280), (660, 430), "HTTPS + WSS", (555, 335))
    connector(draw, (410, 490), (660, 470), "HTTPS + WSS", (545, 470))
    connector(draw, (410, 700), (660, 520), "HTTPS + WSS", (555, 625))

    asset_color = "#2e7d32"
    rail_x = 515
    draw.line((660, 180, rail_x, 180, rail_x, 700), fill=asset_color, width=3)
    for y in (280, 490, 700):
        draw.line((rail_x, y, 410, y), fill=asset_color, width=3)
        arrow_head(draw, (rail_x, y), (410, y), asset_color)
    centered(draw, (420, 140, 650, 205), "Vercel serves static assets", SMALL_BOLD, fill=asset_color)

    connector(draw, (1020, 430), (1190, 375), "REST API", (1100, 355))
    connector(draw, (1020, 510), (1190, 605), "REST API", (1100, 585))

    centered(
        draw,
        (275, 840, 1325, 930),
        "All client nodes communicate through the cloud hub. CafeOS does not require direct peer-to-peer communication between endpoints.",
        SMALL_BOLD,
    )

    image.save(TOPOLOGY_OUTPUT)
    print(f"WROTE={TOPOLOGY_OUTPUT}")


def render_model() -> None:
    image = Image.new("RGB", (1600, 1100), "white")
    draw = ImageDraw.Draw(image)
    centered(draw, (0, 25, 1600, 80), "CafeOS Network Model: TCP/IP Internet Model", TITLE)

    layers = [
        (
            "Application Layer",
            "OSI Equivalent: Application, Presentation, Session",
            "Next.js React SSR/CSR, Supabase JS Client, Maya REST API, Lalamove REST API, PWA Manifest",
            "#d9ead3",
            "#2e7d32",
        ),
        (
            "Transport Layer",
            "OSI Equivalent: Transport",
            "TCP for HTTPS requests and TCP + WSS for Supabase Realtime channels",
            "#d9eaf7",
            "#01579b",
        ),
        (
            "Internet Layer",
            "OSI Equivalent: Network",
            "IPv4/IPv6 routing over public internet through ISP and cloud provider networks",
            "#fff2cc",
            "#bf9000",
        ),
        (
            "Network Access Layer",
            "OSI Equivalent: Data Link, Physical",
            "Wi-Fi 802.11 for branch devices and 4G/5G cellular for customer mobile devices",
            "#fce4ec",
            "#c62828",
        ),
    ]

    y = 135
    for title, osi, implementation, fill, outline in layers:
        box = (130, y, 1470, y + 170)
        draw.rounded_rectangle(box, radius=24, fill=fill, outline=outline, width=4)
        draw.rectangle((130, y, 470, y + 170), fill=fill, outline=outline, width=4)
        centered(draw, (150, y + 20, 450, y + 150), title, NODE)
        centered(draw, (500, y + 22, 1440, y + 67), osi, SMALL_BOLD)
        centered(draw, (500, y + 75, 1440, y + 150), implementation, SMALL)
        if y < 675:
            draw.line((800, y + 170, 800, y + 215), fill=BLACK, width=3)
            arrow_head(draw, (800, y + 170), (800, y + 215))
        y += 215

    protocol_box = (190, 995, 1410, 1060)
    draw.rounded_rectangle(protocol_box, radius=18, fill=LIGHT_GRAY, outline="#666666", width=2)
    centered(
        draw,
        protocol_box,
        "Primary protocols: HTTPS/TLS 1.3, WSS, HMAC-SHA256 request signing, and DNS resolution.",
        SMALL_BOLD,
    )

    image.save(MODEL_OUTPUT)
    print(f"WROTE={MODEL_OUTPUT}")


def main() -> None:
    render_topology()
    render_model()


if __name__ == "__main__":
    main()
