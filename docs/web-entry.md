# Web Input Guide

## 1. Entry point

After the service starts, open the web client:

1. On your Mac: `http://localhost:5001/`
2. On your iPhone: `http://<mac-ip>:5001/` while both devices stay on the same LAN
3. Optional: in Safari, use `Share -> Add to Home Screen` to make it behave like a lightweight app launcher

## 2. What the page does

The page exposes two input modes in the same conversation shell:

1. **Text composer**: sends `application/json` to `POST /distill`
2. **Audio composer**: records in-browser when possible, or falls back to file upload, then sends `multipart/form-data` to `POST /distill`

The UI direction follows a warm editorial light theme:

1. light background with atmospheric gradients instead of flat white
2. serif display typography paired with a clean sans body font
3. sage and clay accents instead of default AI purple gradients
4. mobile-first spacing, large tap targets, and reduced-motion support

## 3. Conversation loop

Each turn works like this:

1. Read the current clarification prompt in the top card.
2. Answer with text or audio.
3. Wait for the page to receive the next JSON response.
4. Continue until the result panel shows the final Markdown.

The page stores `session_id` in memory for the current browser session and automatically reuses it between turns. If you refresh the page, start a new conversation.

## 4. iPhone usage notes

1. Safari may ask for microphone permission the first time you try browser recording.
2. If browser recording is not available, use the file picker and record with the system capture flow.
3. Keep the page open during a conversation so the in-memory `session_id` is preserved.
4. The final Markdown can be copied from the result panel into your vault workflow.

## 5. Request contract

### Text turn

```json
{
  "input_mode": "text",
  "text": "I want to clarify an idea",
  "session_id": "optional-uuid"
}
```

### Audio turn

Send `multipart/form-data` with:

1. `input_mode=audio`
2. `audio=<file>`
3. `session_id=<uuid>` on follow-up turns

### Response shape

```json
{
  "session_id": "uuid",
  "response_type": "clarify",
  "assistant_message": "What outcome do you want from this idea?",
  "turn_index": 1,
  "is_complete": false,
  "final_markdown": null,
  "final_title": null,
  "milestone": null
}
```

## 6. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Audio button starts but no recording is produced | Browser microphone permission was denied |
| `400` on an audio turn | The uploaded file was missing or malformed |
| `400 session_id must be a valid UUID` | The page state was reset and a stale session id was submitted manually |
| `409` on a follow-up turn | The server already completed or abandoned the referenced session |
| Final panel stays empty | The conversation is still in `clarify` mode, or the server returned an error |