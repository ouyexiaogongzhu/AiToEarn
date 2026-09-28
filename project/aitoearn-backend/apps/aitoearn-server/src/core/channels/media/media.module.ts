import { Module } from '@nestjs/common'
import { AssetsService, VideoMetadataService } from '@yikart/assets'
import { config } from '../../../config'
import { MediaService } from './media.service'

function resolveAllowedOutboundHosts(): string[] {
  const hosts = new Set<string>()
  const assets = config.assets as { cdnEndpoint?: string, publicEndpoint?: string, endpoint?: string }
  for (const raw of [assets?.cdnEndpoint, assets?.publicEndpoint, assets?.endpoint]) {
    if (!raw)
      continue
    try {
      hosts.add(new URL(raw).hostname.toLowerCase())
    }
    catch {
      // ignore invalid asset endpoint config
    }
  }
  return [...hosts]
}

@Module({
  providers: [
    {
      provide: MediaService,
      useFactory: (videoMetadataService: VideoMetadataService, assetsService: AssetsService) => {
        return new MediaService(videoMetadataService, assetsService, resolveAllowedOutboundHosts())
      },
      inject: [VideoMetadataService, AssetsService],
    },
  ],
  exports: [MediaService],
})
export class MediaModule {}
