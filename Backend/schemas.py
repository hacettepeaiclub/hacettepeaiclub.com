from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime

    # Pydantic V2'nin modern ayar tanımlaması
    model_config = ConfigDict(from_attributes=True)