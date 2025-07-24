# Debugging Common Errors in Google Meet Agent MVP

## 1. Vexa Bot Request Error (409)

**Error:**
```
Vexa Bot Request Error: An active or requested meeting already exists for this platform and meeting ID, and its container is running.
```
**Cause:**
- The Vexa API does not allow multiple bots for the same meeting ID if one is already active or being requested.

**How to Fix:**
- Wait for the existing bot to finish or stop the current session before starting a new one with the same meeting ID.
- If you believe no session is active, check the Vexa dashboard or API for orphaned/running bots and terminate them.

**Reference:**
- [Vexa API Docs](https://github.com/Vexa-ai/vexa/blob/main/docs/user_api_guide.md)

---

## 2. Sarvam TTS Language Code Validation Error

**Error:**
```
Validation Error(s): target_language_code: Input should be 'bn-IN', 'en-IN', ...
```
**Cause:**
- The `target_language_code` sent to Sarvam TTS is not one of the allowed values.

**How to Fix:**
- Always use a valid language code (e.g., 'en-IN' for English). See the list of supported codes in the Sarvam docs.
- Validate or default the language code in your backend before making the TTS call.

**Reference:**
- [Sarvam TTS API Docs](https://docs.sarvam.ai/api-reference-docs/text-to-speech/convert)

---

## 3. Transcript Endpoint 404

**Error:**
```
GET /api/meeting/:meetingId/transcript 404 (Not Found)
Transcript not yet available: Endpoint not found
```
**Cause:**
- The backend cannot find a transcript for the given meeting ID.
- The meeting session may not be active, or transcript generation/storage is not working.

**How to Fix:**
- Ensure the meeting session is started and active.
- Check that the transcript provider (e.g., Vexa) is returning data and that your backend is storing/updating transcripts.
- Add logging to the backend endpoint to debug why the transcript is missing.

**Reference:**
- [Vexa API Docs](https://github.com/Vexa-ai/vexa/blob/main/docs/user_api_guide.md)

---

## 4. No Live Transcripts or Delayed Responses

**Symptoms:**
- No live transcript updates in the UI.
- Bot responses are delayed or missing.
- Speech-to-text (STT) and text-to-speech (TTS) not working in the meeting.

**Possible Causes:**
- Backend polling for transcripts is not working (e.g., Vexa API issues, session not active).
- TTS/STT errors (see above).
- Audio is not being injected into the meeting or sent to the frontend for playback.

**How to Fix:**
- Check backend logs for errors in transcript polling or TTS/STT conversion.
- Ensure the agent is started successfully and the meeting session is active.
- Make sure the frontend or meeting bot is set up to play audio responses.

**References:**
- [Sarvam API Docs](https://docs.sarvam.ai/api-reference-docs/introduction)
- [Vexa API Docs](https://github.com/Vexa-ai/vexa/blob/main/docs/user_api_guide.md)

---

## General Debugging Tips
- Always check backend logs for detailed error messages.
- Use the provided test endpoints (e.g., `/api/test/sarvam-tts`) to verify TTS/STT independently.
- Validate all input parameters before making API calls.
- Refer to the official documentation for each service for the latest supported features and error codes. 