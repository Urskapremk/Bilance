export const PDF_WINDOW_NAME = "bilance-predogled"
export const PDF_WINDOW_KEY = "bilance-predogled"

export type PdfWindowMessage = {
  type: "bilance-predogled"
  url: string
  title: string
  bytes?: ArrayBuffer
}

export async function openPdfWindow(url: string, title: string): Promise<boolean> {
  const message: PdfWindowMessage = { type: "bilance-predogled", url, title }
  if (url.startsWith("blob:")) {
    const response = await fetch(url)
    if (!response.ok) return false
    message.bytes = await response.arrayBuffer()
  }
  sessionStorage.setItem(PDF_WINDOW_KEY, JSON.stringify({ url: message.bytes ? "" : url, title }))
  const popup = window.open(
    "/predogled",
    PDF_WINDOW_NAME,
    "popup=yes,width=1280,height=900,left=60,top=40,resizable=yes,scrollbars=yes",
  )
  if (!popup) return false
  const send = () => {
    if (popup.closed) return
    popup.postMessage(message, window.location.origin)
  }
  popup.addEventListener("load", send)
  window.setTimeout(send, 200)
  window.setTimeout(send, 700)
  popup.focus()
  return true
}
