"""Translation utility functions using Amazon Nova Micro model"""

import os
from aws_lambda_powertools import Logger
from .core import BEDROCK_CLIENT, DEFAULT_TRANSLATION

# Logger setup
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
logger = Logger(service="vto_translate", level=LOG_LEVEL)


def translate_to_english(text: str) -> str:
    """
    Translate text to English using Nova Micro model

    Args:
        text: Text to translate

    Returns:
        Translated English text
    """
    try:
        # Prepare the translation request
        prompt = f"""
Translate the following <text> to English. It the <text> is English, you must return the same <text>. Only return the translated text, nothing else
<text>{text}</text>"""
        messages = [
            {
                "role": "user",
                "content": [{"text": prompt}],
            }
        ]

        # Call Nova Micro using Converse API
        response = BEDROCK_CLIENT.converse(
            modelId=DEFAULT_TRANSLATION,
            messages=messages,
            inferenceConfig={"maxTokens": 1000, "temperature": 0.1, "topP": 0.9},
        )

        # Extract the translated text
        if "output" in response and "message" in response["output"]:
            content = response["output"]["message"]["content"]
            if content and len(content) > 0 and "text" in content[0]:
                translated_text = content[0]["text"].strip()
                logger.info(f"Translation successful: '{text}' -> '{translated_text}'")
                return translated_text

        logger.warning(f"Translation failed, returning original text: {text}")
        return text

    except Exception as e:
        logger.error(f"Error in translation: {str(e)}")
        logger.warning(f"Translation failed, returning original text: {text}")
        return text
