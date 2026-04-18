from typing import List


def empty_if_none(data: List[str]) -> List[str]:
    """Utility helper to normalise None to empty list.

    Keeps downstream code simple when dealing with optional lists.
    """
    return data if data is not None else []
