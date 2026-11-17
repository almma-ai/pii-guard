# Draws store/promo-small-440x280.png from the icon. Run: python3 store/make-promo.py
from PIL import Image, ImageDraw, ImageFont
import os
HERE = os.path.dirname(os.path.abspath(__file__))
B = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
R = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
img = Image.new('RGB', (440, 280), (255, 255, 255)); d = ImageDraw.Draw(img)
d.rectangle([0, 0, 440, 280], fill=(250, 246, 246))
icon = Image.open(os.path.join(HERE, '..', 'src', 'icons', 'icon512.png')).resize((112, 112), Image.LANCZOS)
img.paste(icon, (28, 84), icon)
d.text((160, 88), 'PII Guard', font=ImageFont.truetype(B, 40), fill=(176, 0, 32))
d.text((160, 142), 'Catches names, IDs and dates', font=ImageFont.truetype(R, 18), fill=(40, 40, 40))
d.text((160, 166), 'before they reach the chatbot.', font=ImageFont.truetype(R, 18), fill=(40, 40, 40))
d.text((160, 202), 'Runs 100% on your computer', font=ImageFont.truetype(B, 15), fill=(26, 127, 75))
img.save(os.path.join(HERE, 'promo-small-440x280.png'))
print('ok')
