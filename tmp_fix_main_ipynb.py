import json
from pathlib import Path


path = Path(r"E:\test\speak joy\be\ai\ipa\main.ipynb")
nb = json.loads(path.read_text(encoding="utf-8"))

nb["cells"][2]["source"] = [
    "import importlib\n",
    "import subprocess\n",
    "import sys\n",
    "\n",
    "required_packages = {\n",
    "    \"psycopg2\": \"psycopg2-binary\",\n",
    "    \"pandas\": \"pandas\",\n",
    "    \"dotenv\": \"python-dotenv\",\n",
    "    \"sqlalchemy\": \"sqlalchemy\",\n",
    "}\n",
    "\n",
    "missing = [package for module, package in required_packages.items() if importlib.util.find_spec(module) is None]\n",
    "\n",
    "if missing:\n",
    "    subprocess.check_call([sys.executable, \"-m\", \"pip\", \"install\", \"--quiet\", *missing])\n",
    "    print(f\"Đã cài: {', '.join(missing)}\")\n",
    "else:\n",
    "    print(\"Các package cần thiết đã có sẵn.\")\n",
]

nb["cells"][4]["source"] = [
    "import os\n",
    "from pathlib import Path\n",
    "\n",
    "import pandas as pd\n",
    "import psycopg2\n",
    "from dotenv import load_dotenv\n",
    "\n",
    "\n",
    "def find_env_file() -> Path:\n",
    "    candidates = [\n",
    "        Path.cwd() / \".env\",\n",
    "        Path.cwd().parent / \".env\",\n",
    "        Path.cwd().parent.parent / \".env\",\n",
    "        Path.cwd().parent.parent.parent / \".env\",\n",
    "        Path.cwd() / \"be\" / \".env\",\n",
    "        Path.cwd().parent / \"be\" / \".env\",\n",
    "    ]\n",
    "\n",
    "    seen = set()\n",
    "    for candidate in candidates:\n",
    "        candidate = candidate.resolve()\n",
    "        if candidate in seen:\n",
    "            continue\n",
    "        seen.add(candidate)\n",
    "        if candidate.exists():\n",
    "            return candidate\n",
    "\n",
    "    raise FileNotFoundError(\n",
    "        \"Không tìm thấy file .env. Hãy mở notebook từ thư mục dự án hoặc tạo be/.env\"\n",
    "    )\n",
    "\n",
    "\n",
    "env_path = find_env_file()\n",
    "load_dotenv(dotenv_path=env_path, override=False)\n",
    "\n",
    "DATABASE_URL = os.getenv(\"DIRECT_URL\") or os.getenv(\"DATABASE_URL\")\n",
    "if not DATABASE_URL:\n",
    "    raise EnvironmentError(\"Không tìm thấy DIRECT_URL hoặc DATABASE_URL trong .env\")\n",
    "\n",
    "if \"cur\" in globals() and cur and not getattr(cur, \"closed\", True):\n",
    "    cur.close()\n",
    "if \"conn\" in globals() and conn and not getattr(conn, \"closed\", True):\n",
    "    conn.close()\n",
    "\n",
    "conn = psycopg2.connect(DATABASE_URL)\n",
    "conn.autocommit = True\n",
    "cur = conn.cursor()\n",
    "print(f\"Kết nối database thành công. env={env_path}\")\n",
]

nb["cells"][20]["source"] = [
    "if \"cur\" in globals() and cur and not getattr(cur, \"closed\", True):\n",
    "    cur.close()\n",
    "if \"conn\" in globals() and conn and not getattr(conn, \"closed\", True):\n",
    "    conn.close()\n",
    "print(\"Đã đóng kết nối database.\")\n",
]

path.write_text(json.dumps(nb, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
