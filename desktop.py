"""Windows launcher: bundled UI, remote simulation, no local AI installation."""
import argparse
import json
import threading
import webbrowser
from pathlib import Path

from werkzeug.serving import make_server

from src.main import app


class desktopApplication:
    def run(self, smokeOutput: str | None = None) -> None:
        if smokeOutput:
            client = app.test_client()
            result = {"pages": {route: client.get(route).status_code for route in
                                ("/simulation", "/forum", "/community", "/assistant")},
                      "static": client.get("/static/simulation.js").status_code,
                      "cloudApi": app.config["SIMULATION_API_URL"]}
            Path(smokeOutput).write_text(json.dumps(result), encoding="utf-8")
            return
        import tkinter as tk

        server = make_server("127.0.0.1", 0, app, threaded=True)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = f"http://127.0.0.1:{server.server_port}/simulation"
        window = tk.Tk()
        window.title("Mạch Đồng")
        window.geometry("440x220")
        window.configure(bg="#f3f6ef")
        tk.Label(window, text="Mạch Đồng đang chạy", font=("Segoe UI", 19, "bold"),
                 bg="#f3f6ef", fg="#14513a").pack(pady=(25, 12))
        tk.Label(window, text="Giao diện mở trong trình duyệt.\nMô phỏng và dữ liệu cần kết nối Internet.",
                 bg="#f3f6ef", font=("Segoe UI", 10)).pack(pady=5)
        tk.Button(window, text="Mở ứng dụng", command=lambda: webbrowser.open(url)).pack(pady=12)

        def stopApp():
            server.shutdown()
            window.destroy()

        window.protocol("WM_DELETE_WINDOW", stopApp)
        webbrowser.open(url)
        window.mainloop()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke-output")
    args = parser.parse_args()
    desktopApplication().run(args.smoke_output)
