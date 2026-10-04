I have created the single-question maternal health check screen for **AMMA**, tailored specifically for low-literacy clarity and shared-device accessibility:

### Design Choices
1. **Header & Context (`Sign 4 of 9`)**: A discreet top bar with a clear "Close" action, a progress pill showing progress through the 9 danger signs, and a prominent "Replay" button to replay the audio prompt at any time.
2. **Hero Spoken Speech Card**: The focal point of the screen is an active spoken card displaying the verbatim question *"Since last time, have you had a bad headache, or has your vision been blurred?"* paired with an intuitive head illustration and dual English/Hindi bilingual subtitles for immediate comprehension.
3. **Voice Disclosure**: A subtle indicator beneath the card informs the user: *"Using the phone's own voice."*
4. **Three Primary Response Targets (≥88px tall)**:
   - **Yes (The Serious One)**: Highlighted with an alert icon and warm terracotta/crimson accent to give danger signs proper gravity.
   - **No (The Calm One)**: Highlighted with a reassuring checkmark and gentle teal/green outline.
   - **Not sure (The Gentle One)**: A neutral warm-sand tone with a friendly question mark for moments of doubt.
5. **Multimodal Input**:
   - A large, accessible circular microphone button with the label **"Tap and speak"** (along with bilingual prompt).
   - An unobtrusive text entry field (*"Or type here..."* with a Send button) at the bottom for silent input or family assistance.
6. **Tone & Restraint**: Strictly excluded tab bars, metric widgets, and extraneous lists to maintain focus on the single danger-sign assessment.

Suggestions:
- Show the 'Yes' confirmation state (urgent referral/care advice)
- Show the active listening/recording state when 'Tap and speak' is pressed
- Create the Marathi translation version of this question