"""Generate AMMA screens in Stitch and save HTML + screenshots."""
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path("/home/saurabh/Desktop/a/code/hackathons/worldbank/.stitch")
PID = "4636124252891906861"
DS = "assets/9389483915077379523"
KEY = json.loads(Path("/home/saurabh/.cursor/mcp.json").read_text())["mcpServers"]["stitch"]["env"]["STITCH_API_KEY"]

CONTEXT = (
    "Product: AMMA, a weekly maternal-health check on a shared family smartphone. "
    "Users: a pregnant woman or a mother in the six weeks after birth, often with low literacy, "
    "speaking English, Hindi, or Marathi; sometimes a family member or community health worker taps for her. "
    "The phone may be shared. Works offline. One question at a time. No charts, no login wall, no bottom tab bar, "
    "no fake heart-rate or weight widgets. Cute and calm, like a trusted aunt: soft cards, large type, pictures next to words. "
    "Danger must look serious when it appears. "
)

SCREENS = {
    "home": """
Mobile screen, portrait, single column.

""" + CONTEXT + """
This is the home screen. Job: choose whose check this is, or add someone. Language is chosen here because the phone is shared.

PAGE STRUCTURE:
1. Header row: a small soft circular mark (a simple crescent cradle, not a medical cross) beside the wordmark "AMMA", and on the right a compact language menu showing "हिन्दी".
2. Greeting block: headline "Who are we checking on today?" and one quieter line "A weekly check, in her own words."
3. A short honey note card: "Draft wording, not yet checked by a speaker or a clinician."
4. Two tall person cards. Card one: name "Sunita", a small lock, subtitle "Pregnant · 28 weeks · last check 3 days ago". Card two: name "Meera", subtitle "Baby is 2 weeks old · no check yet".
5. A full-width secondary button "Add a person" with a plus, sitting in the thumb zone.
No tab bar. No illustration of a baby that competes with the names.
""",
    "person": """
Mobile screen, portrait, single column.

""" + CONTEXT + """
This is one woman's home inside the app, after her record is opened. Job: start this week's check, or open the things a helper needs.

PAGE STRUCTURE:
1. Top bar: text button "Back" on the left, her name "Sunita" as the title.
2. A soft status card: "Pregnant · 28 weeks" as the headline, and "Last session: 1 Oct" underneath. A small lock chip "PIN on".
3. One dominant pill button, full width, in the thumb zone area but visually first among actions: "Start this week's session".
4. A 2-by-2 grid of white action cards, each with a simple line icon and a short label:
   - "Card for the clinic"
   - "Teach the phone my voice"
   - "Send danger-sign audio"
   - "Sources"
5. A quiet text button at the bottom: "Delete this record".
No dashboard of vitals.
""",
    "setup": """
Mobile screen, portrait, single column, a form.

""" + CONTEXT + """
This screen adds a person to the shared phone. Keep every field visible. Labels sit above the fields.

PAGE STRUCTURE:
1. Top: text button "Back", title "Add a person".
2. A honey note: "Anyone who can open this phone can see this record unless you set a PIN."
3. Fields, each a white rounded field with a visible label:
   - "A name or word for this record" filled with "Sunita"
   - "Language" showing Hindi
   - Two equal choice chips: "Pregnant" selected, "Baby is born" unselected
   - "Expected date of birth"
   - "Next clinic visit"
   - "Her own phone number (for the weekly SMS)"
   - A group titled "What the nurse has told her" with two checkboxes: "High blood pressure" and "First pregnancy"
   - "PIN to lock this record (optional)"
4. Bottom row: "Back" as text, and a filled pill "Save".
""",
    "check": """
Mobile screen, portrait. The heart of the product: one spoken question, then a huge answer.

""" + CONTEXT + """
She is in the weekly check. AMMA has just asked one danger-sign question out loud.

PAGE STRUCTURE:
1. Thin top bar: a text "Close" on the left, a "Replay" text button on the right. A small step hint "Sign 4 of 9".
2. One large speech card, the biggest text on the screen: "Since last time, have you had a bad headache, or has your vision been blurred?" A small picture of a head sits at the start of the card. The card looks like the line currently being spoken.
3. A quiet line under it: "Using the phone's own voice."
4. Three equal tall answer buttons in a row, labels under a simple mark:
   - "Yes"
   - "No"
   - "Not sure"
   Yes is visually the serious one, No is the calm one, Not sure is the gentle one. Each is at least 88px tall.
5. Below, a large circular microphone button labelled "Tap and speak", and under it a single text field "Or type here" with a "Send" button.
Do not show a list of other symptoms. One question only.
""",
    "pictures": """
Mobile screen, portrait.

""" + CONTEXT + """
Recall step. She is asked which danger signs mean she must go to the hospital. Pictures were hidden until she asked to see them. Now the picture grid is open.

PAGE STRUCTURE:
1. Top bar: "Close" and "Replay".
2. Speech card: "Which signs mean you must go to the hospital straight away?"
3. A two-column grid of six large picture tiles. Each tile has one simple picture and a short label:
   - Bleeding
   - Fits
   - High fever
   - Severe headache
   - Baby not moving
   - Swollen hands
4. Above the grid, a large circular "Tap and speak" button.
5. A text field "Or type here" and "Send".
Tiles are the focus. No extra navigation.
""",
    "clinic": """
Mobile screen, portrait. This screen is for the midwife at the clinic, not for the mother to study. It should feel like a clear paper card she can hand over.

""" + CONTEXT + """
PAGE STRUCTURE:
1. Top: "Back" and title "Card for the clinic".
2. A header band on the card: "Sunita", "Pregnant · 28 weeks", tracks "High blood pressure".
3. Section "Signs she said yes to" with two lines: "1 Oct — Severe headache" and "1 Oct — Blurred vision". This section is visually urgent.
4. Section "Signs she was not sure about" with one line: "1 Oct — Swollen hands".
5. Section "What she described": "24 Sep — Fever, two days".
6. A small meta line: "Signs recalled without help: 1 / 11 (1 Oct)".
7. Section "Her plan" as a definition list: "Who decides" Sunita's mother, "Hospital" District Hospital · 12 km, "Next visit" 18 Oct.
White card on warm paper. Easy to read at arm's length. No charts.
""",
    "teach": """
Mobile screen, portrait.

""" + CONTEXT + """
She teaches the phone how she says each danger sign, in her own words. Only this phone keeps it. No sound file is stored, only a match for later.

PAGE STRUCTURE:
1. Top: "Back" and title "Teach the phone my voice".
2. One sentence of help: "Tap a sign, say it in your own words, then tap again. Do each one two or three times."
3. A vertical list of five large rows. Each row shows a picture, the sign name, and how many examples are saved:
   - Bleeding during pregnancy · 2
   - Fits · 0
   - High fever · 1, and this row is in a recording state labelled "Tap when you have finished"
   - Severe headache · 0
   - Baby moving less · 3
The recording row is clearly the active one. Others look quiet.
""",
    "urgent": """
Mobile screen, portrait. The check has ended and one danger sign is present. This screen must feel serious but not panicked. She needs to know what to do and be able to call in one tap.

""" + CONTEXT + """
PAGE STRUCTURE:
1. Top: "Close" and "Replay".
2. A serious banner, not a cute illustration: "Go to the hospital now." Then the spoken line: "You have one danger sign. Go to the nearest suitable hospital straight away."
3. Her plan as a short card: "Hospital — District Hospital, 12 km" and "Call — Sunita, 98200 00000".
4. A full-width call button: "Call Sunita".
5. A preview of the SMS she can send to her own basic phone, then a button "Send SMS".
6. A filled button "Finish".
Do not say she is fine. Do not add confetti. Keep the warm paper, but the banner is clearly urgent.
""",
}


def call(name, arguments, timeout=420):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": arguments}}
    req = urllib.request.Request(
        "https://stitch.googleapis.com/mcp",
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "X-Goog-Api-Key": KEY,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode())
    if "error" in data:
        raise RuntimeError(json.dumps(data["error"])[:1500])
    result = data["result"]
    if result.get("isError"):
        raise RuntimeError(json.dumps(result)[:1500])
    return json.loads(result["content"][0]["text"])


def download(url, dest: Path):
    req = urllib.request.Request(url, headers={"User-Agent": "amma-stitch"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        dest.write_bytes(resp.read())


def one(slug, prompt):
    print(f"START {slug}", flush=True)
    raw = call(
        "generate_screen_from_text",
        {
            "projectId": PID,
            "designSystem": DS,
            "deviceType": "MOBILE",
            "modelId": "GEMINI_3_8_FLASH",
            "prompt": prompt.strip(),
        },
    )
    (ROOT / "designs" / f"{slug}.json").write_text(json.dumps(raw, indent=2)[:500000])
    # Find download urls anywhere in the payload.
    blob = json.dumps(raw)
    print(f"DONE {slug} bytes={len(blob)}", flush=True)
    return slug, raw


def main():
    (ROOT / "designs").mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = [pool.submit(one, slug, prompt) for slug, prompt in SCREENS.items()]
        for fut in as_completed(futs):
            try:
                slug, _ = fut.result()
                print(f"OK {slug}", flush=True)
            except Exception as e:
                print(f"FAIL {e}", flush=True)


if __name__ == "__main__":
    main()
