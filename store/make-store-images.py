# Makes the Chrome Web Store images: 5 captioned screenshots (1280x800) and the marquee tile (1400x560).
# All saved as 24-bit RGB PNG (no alpha). Run: python3 store/make-store-images.py [rightclick-frame.png]
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
B = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
R = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
RED = (176, 0, 32); INK = (30, 30, 30); MUTED = (90, 90, 90); BG = (248, 244, 243); GREEN = (26, 127, 75)
ICON = Image.open(os.path.join(HERE, '..', 'src', 'icons', 'icon512.png'))
f = ImageFont.truetype

def shot(out, src, title, sub, crop=None):
    W, H = 1280, 800
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    ic = ICON.resize((40, 40), Image.LANCZOS); im.paste(ic, (56, 40), ic)
    d.text((110, 34), title, font=f(B, 40), fill=INK)
    d.text((110, 86), sub, font=f(R, 25), fill=MUTED)
    pic = Image.open(src).convert('RGB')
    if crop: pic = pic.crop(crop)
    box_w, box_h = 1168, 610
    s = min(box_w / pic.width, box_h / pic.height)
    pic = pic.resize((round(pic.width * s), round(pic.height * s)), Image.LANCZOS)
    x, y = (W - pic.width) // 2, 150 + (box_h - pic.height) // 2
    shadow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(shadow).rounded_rectangle([x + 4, y + 8, x + pic.width + 4, y + pic.height + 8], 14, fill=80)
    im.paste((185, 175, 175), (0, 0), shadow.filter(ImageFilter.GaussianBlur(14)))
    im.paste(pic, (x, y))
    ImageDraw.Draw(im).rectangle([x - 1, y - 1, x + pic.width, y + pic.height], outline=(220, 214, 214), width=1)
    im.save(os.path.join(HERE, out))

def marquee():
    W, H = 1400, 560
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    ic = ICON.resize((220, 220), Image.LANCZOS); im.paste(ic, (90, 170), ic)
    d.text((360, 150), 'PII Guard', font=f(B, 96), fill=RED)
    d.text((364, 268), 'Keep names, e-mails and numbers out of your AI chats.', font=f(R, 38), fill=INK)
    chip_y = 340
    for i, (a, b) in enumerate([('John Smith', '[NAME_1]'), ('555-123-4567', '[NUMBER_1]')]):
        x = 364 + i * 470
        txt = f'{a} → {b}'
        w = d.textlength(txt, font=f(B, 30)) + 40
        d.rounded_rectangle([x, chip_y, x + w, chip_y + 58], 12, fill=(255, 225, 228))
        d.text((x + 20, chip_y + 13), txt, font=f(B, 30), fill=RED)
    d.text((364, 440), 'Runs 100% on your computer', font=f(B, 32), fill=GREEN)
    im.save(os.path.join(HERE, 'promo-marquee-1400x560.png'))

rightclick = sys.argv[1] if len(sys.argv) > 1 else None
shot('screenshot-1-review.png', os.path.join(HERE, 'raw', 'review.png'), 'Catches personal data before it is sent',
     'Pasted text waits in a review panel. One key swaps names and numbers for placeholders.')
shot('screenshot-2-typing.png', os.path.join(HERE, 'raw', 'typing.png'), 'Flags names, e-mails and dates as you type',
     'Sending pauses until you have reviewed what was found.')
if rightclick:
    shot('screenshot-3-rightclick.png', rightclick, 'Teach it new names in two clicks',
         'Select a word, right-click, PII Guard → Always flag (or Never flag).', crop=(0, 120, 848, 906))
shot('screenshot-4-originals.png', os.path.join(HERE, 'raw', 'originals.png'), 'Get the real names back',
     '"Show originals" restores the AI’s reply in a private panel, never in the page.')
shot('screenshot-5-settings.png', os.path.join(HERE, 'raw', 'settings.png'), 'Your rules, tested live',
     'Switch rules on or off, add names and your own patterns. Includes HIPAA rules.')
marquee()
print('ok')
