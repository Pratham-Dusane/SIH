"""
Context-aware query suggestions -- generated after image upload.

Solves the "non-expert does not know what to ask" problem the PRD raises.
Reads scene metadata (modality, input config, bands, geo info) and returns
relevant query suggestions the frontend renders as clickable chips prefixed
with "Try asking:".
"""

from __future__ import annotations

from typing import List


def generate_suggestions(
    input_config: str,
    modalities: List[str],
    band_count: int = 3,
    georeferenced: bool = True,
    has_dates: bool = False,
) -> List[str]:
    """
    Return 4-6 context-aware query suggestions based on scene metadata.

    These are more specific than the static mocks because they reference
    the actual sensor type, band count, and capabilities available.
    """
    suggestions: List[str] = []

    has_sar = "SAR" in modalities
    has_optical = any(m in ("OPTICAL", "MULTISPECTRAL") for m in modalities)
    is_multispectral = "MULTISPECTRAL" in modalities or band_count >= 4

    if input_config == "BI_TEMPORAL":
        suggestions.append("What changed between these two dates and where?")
        suggestions.append("Has the built-up area increased or decreased?")
        suggestions.append("Show me the change map with the affected area in hectares.")
        if is_multispectral:
            suggestions.append("Has the water body shrunk between these acquisitions?")
            suggestions.append("How much vegetation was lost between the two dates?")
        else:
            suggestions.append("Describe the visible differences between the two images.")
        if georeferenced:
            suggestions.append("How many hectares changed overall?")

    elif input_config == "CROSS_MODAL":
        suggestions.append(
            "Use the optical and SAR images together to identify built-up and water regions."
        )
        suggestions.append(
            "Which dark regions in the optical image are water rather than shadow?"
        )
        suggestions.append(
            "Compare the vegetation extent visible in optical vs SAR."
        )
        if georeferenced:
            suggestions.append("How much area is water according to both sensors?")
        suggestions.append(
            "Where do the optical and SAR sensors disagree about land cover?"
        )

    else:  # SINGLE
        if is_multispectral:
            suggestions.append("What percentage of this area is covered by vegetation?")
            suggestions.append("Highlight the water bodies in this image.")
            suggestions.append("What is the land cover composition of this scene?")
            suggestions.append("Is there any built-up or urban area visible?")
        elif has_sar:
            suggestions.append("Identify the water bodies using SAR backscatter.")
            suggestions.append("What surface types are visible in this SAR image?")
            suggestions.append("Where are the brightest radar returns in this scene?")
        else:
            suggestions.append("Describe the land cover and major objects in this image.")
            suggestions.append("How many buildings are visible?")
            suggestions.append("Highlight any water body visible in the scene.")

        if georeferenced:
            suggestions.append("What is the total area of vegetation in hectares?")
        else:
            suggestions.append("What percentage of the image is covered by water?")

    # Cap at 6 suggestions
    return suggestions[:6]
