import SwiftUI
import UIKit

/**
 THE TOKEN TILES BUY TOKENS.

 They were a price list with no action: three tiles that looked like buttons
 and answered nothing. The web buys a pack with `Telegram.WebApp.openInvoice`
 and, outside Telegram, says the purchase is available inside Telegram
 (player/src/hooks/useTokenTopUp.ts). The app does what that sentence asks:
 it mints the same invoice and hands the link to the Telegram app, where the
 Stars are paid. Coming back, it asks the server what was credited -- the
 cashier's webhook credits, the client's word is never the evidence.
 */
@MainActor
final class TokenPurchase: ObservableObject {  // secret-guard-ok: a store product, no credential
  @Published private(set) var buying: String?
  @Published private(set) var note: String?
  /// Set while an invoice is open in Telegram; cleared by the first check.
  private var awaitingReturn = false

  func buy(_ pack: String) async {
    guard buying == nil else { return }
    buying = pack
    note = nil
    defer { buying = nil }
    do {
      let link = try await API.tokenInvoice(pack: pack)
      awaitingReturn = true
      let opened = await UIApplication.shared.open(link)
      if !opened {
        awaitingReturn = false
        note = say(
          "Telegram did not open. Install it to pay with Stars.",
          "Telegram не открылся. Чтобы платить звёздами, он нужен на телефоне.")
      }
    } catch {
      note = say("No invoice: \(error.localizedDescription)", "Счёт не выставлен: \(error.localizedDescription)")
    }
  }

  /// Back from Telegram: one check now, and a few more while the Stars travel.
  func checkAfterReturn(balance: @escaping (Int) -> Void) async {
    guard awaitingReturn else { return }
    awaitingReturn = false
    note = say("Checking the payment...", "Проверяю оплату...")
    for attempt in 0..<4 {
      if attempt > 0 { try? await Task.sleep(for: .seconds(15)) }
      let found = await API.verifyTokens()
      if let b = found.balance { balance(b) }
      if let credited = found.credited {
        note = say("Credited \(credited) tokens.", "Зачислено токенов: \(credited).")
        return
      }
    }
    note = say(
      "No payment seen yet. If you paid, it will be credited shortly.",
      "Оплата пока не видна. Если вы заплатили, токены придут чуть позже.")
  }
}

/// A tile made pressable. The tile's own look stays the profile's.
struct TokenPackButton<Tile: View>: View {
  let pack: String
  @ObservedObject var purchase: TokenPurchase
  @ViewBuilder var tile: () -> Tile

  var body: some View {
    Button {
      Task { await purchase.buy(pack) }
    } label: {
      tile()
        .overlay {
          if purchase.buying == pack { ProgressView() }
        }
    }
    .buttonStyle(.plain)
    .disabled(purchase.buying != nil)
    .accessibilityIdentifier("profile.tokens.buy.\(pack)")
  }
}
