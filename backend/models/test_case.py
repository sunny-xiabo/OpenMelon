from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from enum import Enum

class TestCaseStatus(str, Enum):
    PASS = "pass"
    FAIL = "fail"
    BLOCKED = "blocked"
    NOT_RUN = "not_run"

class TestStep(BaseModel):
    step_number: int
    description: str
    expected_result: str
    
class TestCase(BaseModel):
    id: Optional[str] = None
    title: str
    description: str
    preconditions: Optional[str] = None
    steps: List[TestStep]
    priority: Optional[str] = None
    created_at: Optional[datetime] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "TC-001",
                "title": "Verify login functionality",
                "description": "Test the user login process",
                "preconditions": "User account exists in the system",
                "steps": [
                    {
                        "step_number": 1,
                        "description": "Navigate to login page",
                        "expected_result": "Login page is displayed"
                    },
                    {
                        "step_number": 2,
                        "description": "Enter valid username and password",
                        "expected_result": "Credentials are accepted"
                    },
                    {
                        "step_number": 3,
                        "description": "Click login button",
                        "expected_result": "User is logged in and redirected to dashboard"
                    }
                ],
                "priority": "High",
                "created_at": "2025-05-12T10:00:00"
            }
        }

class TestCaseRequest(BaseModel):
    context: str
    requirements: str
    
class TestCaseResponse(BaseModel):
    test_cases: List[TestCase]
    excel_url: Optional[str] = None
