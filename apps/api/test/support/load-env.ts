import { config } from 'dotenv'
import { resolve } from 'node:path'

// Roda em cada worker do jest, antes do framework de teste. `override` é o que
// impede o `.env` de desenvolvimento de vencer quando o ConfigModule carregar.
config({ path: resolve(__dirname, '../../.env.test'), override: true, quiet: true })
