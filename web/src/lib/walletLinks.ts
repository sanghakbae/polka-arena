/// Mobile wallets do not inject a provider into Safari or Chrome — MetaMask only
/// exposes `window.ethereum` inside its own in-app browser. So on a phone,
/// "install a wallet" is the wrong advice even when the app is already installed;
/// the page has to be reopened inside the wallet instead.

const MOBILE_UA = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|webOS/i

export function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false
  return MOBILE_UA.test(navigator.userAgent)
}

/// True when we are already running inside a wallet's in-app browser, where a
/// provider exists and the deep link would just reopen the same place.
export function isInWalletBrowser(): boolean {
  if (typeof window === "undefined") return false
  return Boolean(window.ethereum)
}

/// Reopens the current page inside MetaMask's in-app browser.
///
/// The link takes host + path with no scheme; MetaMask prepends https:// itself.
/// Passing a scheme yields a broken URL inside the app.
export function metamaskDeepLink(): string {
  if (typeof window === "undefined") return "https://metamask.io/download/"
  const { host, pathname, search } = window.location
  return `https://metamask.app.link/dapp/${host}${pathname}${search}`
}

/// What to offer someone with no provider: reopen in the wallet on a phone,
/// install the extension on a desktop.
export function noProviderAction(): { label: string; href: string; hint: string } {
  if (isMobileBrowser()) {
    return {
      label: "MetaMask 앱에서 열기",
      href: metamaskDeepLink(),
      hint: "모바일 브라우저는 지갑 앱을 볼 수 없습니다. MetaMask 앱의 내장 브라우저로 이 페이지를 다시 엽니다.",
    }
  }
  return {
    label: "지갑 설치하기",
    href: "https://metamask.io/download/",
    hint: "MetaMask 같은 EVM 지갑 확장이 필요합니다. 설치 후 새로고침해 주세요.",
  }
}
