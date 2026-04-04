export const dynamic = 'force-dynamic'

import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { scrapeDiscoverInitial } from '../../../../inngest/functions/scrape-discover-initial'
import { scrapeDiscoverMonitor } from '../../../../inngest/functions/scrape-discover-monitor'
import { mediaDownloadNormal } from '../../../../inngest/functions/media-download-normal'
import { mediaDownloadPriority } from '../../../../inngest/functions/media-download-priority'
import { audioSeparate } from '../../../../inngest/functions/audio-separate'
import { audioTranscribe } from '../../../../inngest/functions/audio-transcribe'
import { agentAnalyze } from '../../../../inngest/functions/agent-analyze'
import { metricsUpdate } from '../../../../inngest/functions/metrics-update'
import { viralDetect } from '../../../../inngest/functions/viral-detect'
import { memoryCompress } from '../../../../inngest/functions/memory-compress'
import { cleanupBriefings } from '../../../../inngest/functions/cleanup-briefings'
import { cleanupMemoryHistorico } from '../../../../inngest/functions/cleanup-memory-historico'
import { monitorVirais } from '../../../../inngest/functions/monitor-virais'
import { costAggregate } from '../../../../inngest/functions/cost-aggregate'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    scrapeDiscoverInitial,
    scrapeDiscoverMonitor,
    mediaDownloadNormal,
    mediaDownloadPriority,
    audioSeparate,
    audioTranscribe,
    agentAnalyze,
    metricsUpdate,
    viralDetect,
    monitorVirais,
    memoryCompress,
    cleanupBriefings,
    cleanupMemoryHistorico,
    costAggregate,
  ],
})
