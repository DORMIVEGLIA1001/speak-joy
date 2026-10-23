import json
import uuid
import os
import time
from pathlib import Path

try:
    import requests
    import websocket
except ImportError:
    print("Please install required libraries: pip install requests websocket-client")
    exit(1)

# --- Configuration ---
COMFYUI_URL = os.environ.get("COMFYUI_URL", "https://comfy.hungnm.top")
AUDIO_PATH = r"E:\test\speak joy\test.wav"
CLIENT_ID = str(uuid.uuid4())
WORKFLOW_PATH = Path(__file__).resolve().parent / "workflows" / "qwen3_asr_comfyui_api.json"
AUTH = ("chainz", "ch@inz")
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
}


def replace_placeholders(value, replacements):
    if isinstance(value, dict):
        return {
            key: replace_placeholders(item, replacements)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [replace_placeholders(item, replacements) for item in value]
    if isinstance(value, str):
        for placeholder, replacement in replacements.items():
            value = value.replace(placeholder, replacement)
    return value

def upload_file(file_path):
    print(f"Uploading {file_path} to {COMFYUI_URL}...")
    url = f"{COMFYUI_URL}/upload/image" # ComfyUI handles most generic files here
    with open(file_path, 'rb') as f:
        files = {
            'image': (os.path.basename(file_path), f, 'audio/wav')
        }
        data = {'overwrite': 'true'}
        response = requests.post(url, files=files, data=data, auth=AUTH, headers=HEADERS)
    
    response.raise_for_status()
    return response.json()['name']

def queue_prompt(prompt_workflow):
    url = f"{COMFYUI_URL}/prompt"
    data = {"prompt": prompt_workflow, "client_id": CLIENT_ID}
    response = requests.post(url, json=data, auth=AUTH, headers=HEADERS)
    response.raise_for_status()
    return response.json()

def get_history(prompt_id):
    url = f"{COMFYUI_URL}/history/{prompt_id}"
    response = requests.get(url, auth=AUTH, headers=HEADERS)
    response.raise_for_status()
    return response.json()

def build_workflow(audio_filename):
    with WORKFLOW_PATH.open(encoding="utf-8") as file:
        workflow = json.load(file)

    return replace_placeholders(
        workflow,
        {
            "__AUDIO_FILENAME__": audio_filename,
        },
    )

def main():
    if not os.path.exists(AUDIO_PATH):
        print(f"Error: Play audio file not found at {AUDIO_PATH}")
        return

    try:
        # 1. Upload
        server_filename = upload_file(AUDIO_PATH)
        print(f"Uploaded as: {server_filename}")

        # 2. Queue
        workflow = build_workflow(server_filename)
        res = queue_prompt(workflow)
        prompt_id = res['prompt_id']
        print(f"Queued Prompt ID: {prompt_id}")

        # 3. Websocket format for basic auth
        # Python Websocket client header arg
        b64_auth = __import__('base64').b64encode(f"{AUTH[0]}:{AUTH[1]}".encode()).decode()
        ws_headers = [
            f"Authorization: Basic {b64_auth}",
            f"User-Agent: {HEADERS['User-Agent']}"
        ]
        
        ws_url = COMFYUI_URL.replace("http://", "ws://").replace("https://", "wss://")
        ws_url = f"{ws_url}/ws?clientId={CLIENT_ID}"
        
        ws = websocket.WebSocket()
        print(f"Connecting to WS: {ws_url}")
        ws.connect(ws_url, header=ws_headers)
        
        print("Waiting for execution...")
        start = time.time()
        while True:
            out = ws.recv()
            if isinstance(out, str):
                msg = json.loads(out)
                if msg.get('type') == 'executing':
                    data = msg.get('data', {})
                    if data.get('node') is None and data.get('prompt_id') == prompt_id:
                        print(f"Execution finished. ({time.time()-start:.1f}s)")
                        break
                elif msg.get('type') == 'execution_error':
                    print(f"Error: {msg.get('data')}")
                    return
        ws.close()

        # 4. History
        history = get_history(prompt_id)
        outputs = history.get(prompt_id, {}).get('outputs', {})
        
        text_result = None
        for node_id in ['3', '2']:
            if node_id in outputs:
                node_out = outputs[node_id]
                for key in ['source', 'text', 'string', 'transcription', 'STRING']:
                    if key in node_out and isinstance(node_out[key], list) and len(node_out[key]) > 0:
                        text_result = node_out[key][0]
                        break
                if text_result: break
                
        print("\n--- RESULTS ---")
        if text_result:
            print(f"Transcription: {text_result}")
        else:
            print("No text output found in history. Raw outputs:")
            print(json.dumps(outputs, indent=2))

    except requests.exceptions.HTTPError as e:
        print(f"Failed: {type(e).__name__} -> {e}")
        if e.response is not None:
            print(f"Response text: {e.response.text}")
    except Exception as e:
        print(f"Failed: {type(e).__name__} -> {e}")

if __name__ == "__main__":
    main()
