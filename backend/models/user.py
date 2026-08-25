from pydantic import BaseModel
from typing import Optional

class UserProfile(BaseModel):
    uid: str
    email: Optional[str] = None
    name: Optional[str] = None
    workspace_id: Optional[str] = "ws_demo"
