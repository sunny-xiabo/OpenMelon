import os
import re

TARGET_DIRS = [
    "backend/app/api",
    "backend/app/testcase_gen",
    "backend/app/api_execution",
]

def process_file(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    if "raise HTTPException" not in content:
        return

    # Add imports if they don't exist
    if "from app.api.errors import" not in content and "HTTPException" in content:
        import_stmt = "from app.api.errors import InternalError, InvalidRequestError, NotFoundError, UnauthorizedError\n"
        # Find the first import and put it there
        content = re.sub(r'(import .*?\n)', r'\1' + import_stmt, content, count=1)
        if import_stmt not in content:
            # fallback
            content = import_stmt + content

    # Replace HTTPException with appropriate error classes
    
    # 500 errors
    content = re.sub(
        r'raise HTTPException\(\s*status_code=500\s*,\s*detail=(.*?)\s*\)(?:\s+from\s+(\w+))?',
        r'raise InternalError(details=\1)\2',  # This \2 logic might be buggy. Let's just do an inline function or simpler regex.
        content
    )

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

def custom_replace(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
        
    if "raise HTTPException" not in content:
        return

    if "from app.api.errors import" not in content:
        import_stmt = "from app.api.errors import InternalError, InvalidRequestError, NotFoundError, UnauthorizedError\n"
        # Find the first import and put it there
        content = re.sub(r'(import .*?\n)', r'\1' + import_stmt, content, count=1)
        if import_stmt not in content:
            content = import_stmt + content

    def repl(match):
        status = int(match.group(1))
        detail = match.group(2).strip()
        from_clause = match.group(3) or ""
        
        if status >= 500:
            return f"raise InternalError(details={detail}){from_clause}"
        elif status == 404:
            return f"raise NotFoundError(message=str({detail})){from_clause}"
        elif status in (401, 403):
            return f"raise UnauthorizedError(message=str({detail})){from_clause}"
        else:
            return f"raise InvalidRequestError(message=str({detail})){from_clause}"

    # Match: raise HTTPException(status_code=XXX, detail=YYY) [from ZZZ]
    pattern = r'raise HTTPException\(\s*(?:status_code=)?(\d+)\s*,\s*detail=(.*?)\s*\)(?:\s+(from\s+\w+))?'
    new_content = re.sub(pattern, repl, content, flags=re.DOTALL)
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(new_content)


def main():
    for d in TARGET_DIRS:
        abs_d = os.path.abspath(d)
        for root, dirs, files in os.walk(abs_d):
            for file in files:
                if file.endswith(".py"):
                    custom_replace(os.path.join(root, file))

if __name__ == "__main__":
    main()
