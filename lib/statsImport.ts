/**
 * Utility script to import stats data from CSV
 * Usage: Run this script after setting up the database
 * 
 * Example CSV format (data.csv):
 * Supervisor,Name,ACW,AHT,Hold,Talk Time,CSAT_Score,DSAT,NPS_Score,Promoter (*),MOD,MOD (*),FCR,FCR (*),Surveys Answered,Calls Touched,Tickets Solved,Transactions,Productive Hours,TPH
 */

import { supabase } from './supabase'

export interface CSVStat {
  Supervisor: string
  Name: string
  ACW?: string
  AHT?: string
  Hold?: string
  'Talk Time'?: string
  CSAT_Score?: string
  DSAT?: string
  NPS_Score?: string
  'Promoter (*)'?: string
  MOD?: string
  'MOD (*)'?: string
  FCR?: string
  'FCR (*)'?: string
  'Surveys Answered'?: string
  'Calls Touched'?: string
  'Tickets Solved'?: string
  Transactions?: string
  'Productive Hours'?: string
  TPH?: string
}

/**
 * Parse CSV text content and return array of stat records
 */
export function parseCSV(csvContent: string): CSVStat[] {
  const lines = csvContent.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim())
  const records: CSVStat[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim())
    const record: any = {}

    headers.forEach((header, index) => {
      record[header] = values[index] || null
    })

    records.push(record)
  }

  return records
}

/**
 * Convert CSV stat to database format
 */
function convertToDbFormat(csvStat: CSVStat) {
  return {
    supervisor: csvStat.Supervisor,
    name: csvStat.Name,
    acw: csvStat.ACW || null,
    aht: csvStat.AHT || null,
    hold: csvStat.Hold || null,
    talk_time: csvStat['Talk Time'] || null,
    csat_score: csvStat.CSAT_Score || null,
    dsat: csvStat.DSAT || null,
    nps_score: parseFloat(csvStat.NPS_Score || '0') || null,
    promoter: parseInt(csvStat['Promoter (*)'] || '0') || null,
    mod: csvStat.MOD || null,
    mod_value: parseInt(csvStat['MOD (*)'] || '0') || null,
    fcr: csvStat.FCR || null,
    fcr_value: parseInt(csvStat['FCR (*)'] || '0') || null,
    surveys_answered: parseInt(csvStat['Surveys Answered'] || '0') || null,
    calls_touched: parseInt(csvStat['Calls Touched'] || '0') || null,
    tickets_solved: parseInt(csvStat['Tickets Solved'] || '0') || null,
    transactions: parseInt(csvStat.Transactions || '0') || null,
    productive_hours: csvStat['Productive Hours'] || null,
    tph: parseFloat(csvStat.TPH || '0') || null,
  }
}

/**
 * Import stats from CSV content
 */
export async function importStatsFromCSV(csvContent: string): Promise<{ success: number; failed: number; errors: string[] }> {
  try {
    const records = parseCSV(csvContent)
    let success = 0
    let failed = 0
    const errors: string[] = []

    // Convert to database format
    const dbRecords = records
      .filter(r => r.Name && r.Supervisor) // Skip empty rows
      .map(r => convertToDbFormat(r))

    // Batch insert records
    const batchSize = 100
    for (let i = 0; i < dbRecords.length; i += batchSize) {
      const batch = dbRecords.slice(i, i + batchSize)
      const { error } = await supabase.from('stats').insert(batch).select()

      if (error) {
        failed += batch.length
        errors.push(`Batch ${Math.floor(i / batchSize)}: ${error.message}`)
      } else {
        success += batch.length
      }
    }

    return { success, failed, errors }
  } catch (error: any) {
    return {
      success: 0,
      failed: 0,
      errors: [error?.message || 'Unknown error during import'],
    }
  }
}

/**
 * Clear all stats from the database
 */
export async function clearStats(): Promise<boolean> {
  try {
    const { error } = await supabase.from('stats').delete().neq('id', '')

    if (error) {
      console.error('Error clearing stats:', error)
      return false
    }
    return true
  } catch (error) {
    console.error('Error clearing stats:', error)
    return false
  }
}
