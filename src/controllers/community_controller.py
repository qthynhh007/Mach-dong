from flask import (
    Blueprint,
    Response,
    abort,
    jsonify,
    render_template,
    request,
    send_file,
)

from src.config import MAX_CSV_BYTES
from src.services.community_service import sample_csv
from src.services.quality_service import preview_csv

blueprint = Blueprint("community", __name__)


@blueprint.get("/community")
def community() -> str:
    return render_template("community/index.html", current_page="community")


@blueprint.get("/community/samples/<name>")
def download_sample(name: str) -> Response:
    path = sample_csv(name)
    if path is None:
        abort(404)
    return send_file(path, as_attachment=True, mimetype="text/csv")


@blueprint.post("/api/community/preview")
def preview() -> tuple[Response, int]:
    upload = request.files.get("file")
    if (
        not upload
        or not upload.filename
        or not upload.filename.lower().endswith(".csv")
    ):
        return jsonify(data=None, error="Hãy chọn tệp CSV."), 400
    try:
        data = preview_csv(upload.stream.read(MAX_CSV_BYTES + 1))
    except ValueError as error:
        return jsonify(data=None, error=str(error)), 400
    return jsonify(data=data, error=None), 200
