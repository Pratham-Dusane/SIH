from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    org_type: str = Field("Government / ISRO")
    default_region: Optional[str] = "India (South Asia)"

class Workspace(BaseModel):
    id: str
    name: str
    org_type: str
    owner_id: str
    members: List[str] = []
    default_region: Optional[str] = "India"
    created_at: str
