export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      if (!document.execCommand("copy")) throw e;
      return true;
    } catch (copyError) {
      console.error("Failed to copy text:", copyError);
      return false;
    } finally {
      textArea.remove();
    }
  }
}
