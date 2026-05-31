"""Archivio documenti — upload/list/download/delete con base64 storage in MongoDB."""
import uuid
import base64
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response

# Limite 15 MB per file (BSON cap 16 MB → margine sicurezza)
MAX_BYTES = 15 * 1024 * 1024
ALLOWED_TIPI = {"Rogito", "APE", "Contratto", "Fattura", "Planimetria", "Visura", "Altro"}
MIME_BY_EXT = {
    "pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg",
    "jpeg": "image/jpeg", "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def make_documents_router(db, current_user):
    router = APIRouter(prefix="/api/documents")

    @router.get("")
    async def list_documents(immobile_id: Optional[str] = None, tipo: Optional[str] = None,
                              user: dict = Depends(current_user)):
        q = {"user_id": user["id"]}
        if immobile_id:
            q["immobile_id"] = immobile_id
        if tipo:
            q["tipo"] = tipo
        items = await db.documents.find(q, {"_id": 0, "content_base64": 0}).sort("created_at", -1).to_list(500)
        return items

    @router.post("")
    async def upload_document(
        file: UploadFile = File(...),
        nome: Optional[str] = Form(None),
        tipo: str = Form("Altro"),
        immobile_id: Optional[str] = Form(None),
        user: dict = Depends(current_user),
    ):
        if tipo not in ALLOWED_TIPI:
            raise HTTPException(400, f"Tipo non valido. Usa uno di: {sorted(ALLOWED_TIPI)}")
        content = await file.read()
        if len(content) > MAX_BYTES:
            raise HTTPException(413, f"File troppo grande: {len(content)/1024/1024:.1f} MB (max 15 MB)")
        if len(content) == 0:
            raise HTTPException(400, "File vuoto")
        ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
        mime = file.content_type or MIME_BY_EXT.get(ext, "application/octet-stream")
        doc = {
            "id": f"D-{uuid.uuid4().hex[:8].upper()}",
            "user_id": user["id"],
            "nome": nome or file.filename or "documento.pdf",
            "tipo": tipo,
            "immobile_id": immobile_id or None,
            "dimensione_bytes": len(content),
            "dimensione": _human_size(len(content)),
            "mime_type": mime,
            "content_base64": base64.b64encode(content).decode("ascii"),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "caricato": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        }
        await db.documents.insert_one(doc.copy())
        doc.pop("content_base64", None)
        doc.pop("_id", None)
        return doc

    @router.get("/{doc_id}/file")
    async def download_document(doc_id: str, user: dict = Depends(current_user)):
        d = await db.documents.find_one({"id": doc_id, "user_id": user["id"]})
        if not d:
            raise HTTPException(404, "Documento non trovato")
        content = base64.b64decode(d.get("content_base64", ""))
        filename = d.get("nome", "documento.bin")
        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
        return Response(content=content, media_type=d.get("mime_type", "application/octet-stream"), headers=headers)

    @router.delete("/{doc_id}")
    async def delete_document(doc_id: str, user: dict = Depends(current_user)):
        res = await db.documents.delete_one({"id": doc_id, "user_id": user["id"]})
        if res.deleted_count == 0:
            raise HTTPException(404, "Documento non trovato")
        return {"deleted": doc_id}

    return router


def _human_size(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n/1024:.1f} KB"
    return f"{n/1024/1024:.1f} MB"
