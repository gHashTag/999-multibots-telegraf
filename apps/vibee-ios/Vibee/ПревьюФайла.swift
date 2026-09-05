import AVFoundation
import AVKit
import SwiftUI

/**
 * Превью файла в списке генераций.
 *
 * Список был текстовым: «Фото», «Видео», время. Чтобы понять, ТО ли это, что
 * нужно, приходилось брать запись в ролик и смотреть — то есть менять
 * состояние редактора ради вопроса «а что это». Для платного продукта это
 * ещё и риск заплатить второй раз за то, что уже сделано.
 *
 * У картинки — сама картинка. У ролика — КАДР из него, а не значок плёнки:
 * значок одинаков у всех роликов и не отвечает на вопрос. У звука — кнопка
 * проигрывания, потому что показать звук нечем.
 */
struct ПревьюФайла: View {
  let дорожка: String
  let ссылка: String?
  var сторона: CGFloat = 56

  @State private var кадр: UIImage?
  @State private var проигрыватель: AVPlayer?
  @State private var играет = false

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 8).fill(Тема.Цвет.поверхность)
      содержимое
    }
    .frame(width: сторона, height: сторона)
    .clipShape(RoundedRectangle(cornerRadius: 8))
    .task(id: ссылка) { await снятьКадр() }
    .onDisappear {
      // Звук, продолжающий играть после ухода с экрана, человек не свяжет с
      // этой строкой и не найдёт, чем его выключить.
      проигрыватель?.pause()
      играет = false
    }
  }

  @ViewBuilder private var содержимое: some View {
    switch дорожка {
    case "image":
      if let s = ссылка, let u = URL(string: s) {
        AsyncImage(url: u) { изобр in
          изобр.resizable().scaledToFill()
        } placeholder: {
          ProgressView().controlSize(.small)
        }
      } else {
        значок("photo")
      }

    case "video":
      if let к = кадр {
        Image(uiImage: к).resizable().scaledToFill()
          .overlay(значок("play.circle.fill").foregroundStyle(.white.opacity(0.9)))
      } else {
        // Пока кадр снимается — плёнка. Это честное «ещё не знаю», а не
        // подмена ответа: как только кадр есть, он вытесняет значок.
        значок("film")
      }

    case "audio":
      Button {
        переключитьЗвук()
      } label: {
        значок(играет ? "pause.circle.fill" : "play.circle.fill")
          .foregroundStyle(Тема.Цвет.акцент)
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("ии.превью.звук")

    default:
      значок("text.alignleft")
    }
  }

  private func значок(_ имя: String) -> some View {
    Image(systemName: имя)
      .font(.system(size: сторона * 0.42))
      .foregroundStyle(Тема.Цвет.текстПриглушённый)
  }

  /**
   * Кадр из ролика — на ПЕРВОЙ секунде, а не на нулевой.
   *
   * Многие ролики начинаются с чёрного кадра, и постер с нулевой секунды
   * выглядит как «превью не работает». Секунда даёт картинку почти всегда, а
   * если ролик короче — генератор сам вернёт ближайший доступный кадр.
   */
  private func снятьКадр() async {
    guard дорожка == "video", let s = ссылка, let u = URL(string: s) else { return }
    кадр = nil
    let актив = AVURLAsset(url: u)
    let ген = AVAssetImageGenerator(asset: актив)
    ген.appliesPreferredTrackTransform = true
    ген.maximumSize = CGSize(width: сторона * 3, height: сторона * 3)
    do {
      let (изобр, _) = try await ген.image(at: CMTime(seconds: 1, preferredTimescale: 600))
      кадр = UIImage(cgImage: изобр)
    } catch {
      // Молча: значок плёнки уже показан, и списывать это в ошибку экрана
      // незачем — ссылка могла просто протухнуть.
      кадр = nil
    }
  }

  private func переключитьЗвук() {
    guard let s = ссылка, let u = URL(string: s) else { return }
    if проигрыватель == nil { проигрыватель = AVPlayer(url: u) }
    if играет {
      проигрыватель?.pause()
    } else {
      проигрыватель?.seek(to: .zero)
      проигрыватель?.play()
    }
    играет.toggle()
  }
}
