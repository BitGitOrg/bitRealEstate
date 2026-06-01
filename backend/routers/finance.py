"""Finance — fonte di verità per liquidità unificata."""
from fastapi import APIRouter, Depends
from routers.incassi import _compute_liquidity


def make_finance_router(db, current_user):
    router = APIRouter(prefix="/api/finance")

    @router.get("/liquidity")
    async def get_liquidity(user: dict = Depends(current_user)):
        return await _compute_liquidity(db, user["id"])

    return router
