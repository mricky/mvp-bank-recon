-- ==============================================================================
-- 🛡️ Supabase Atomic Unmatch Reconciliation Group Stored Procedure (RPC)
-- Ensures single-transaction atomicity across bank_statement_line, 
-- transaction_journal_line, and bank_reconciliation_match.
-- ==============================================================================

CREATE OR REPLACE FUNCTION unmatch_reconciliation_group(p_group_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bank_count INT := 0;
  v_journal_count INT := 0;
  v_match_count INT := 0;
BEGIN
  IF p_group_id IS NULL OR trim(p_group_id) = '' THEN
    RAISE EXCEPTION 'p_group_id cannot be null or empty';
  END IF;

  -- 1. Revert bank statement lines to UNMATCHED
  WITH reverted_bank AS (
    UPDATE bank_statement_line 
    SET status = 'UNMATCHED', 
        allocated_amount = 0, 
        matched_group_id = NULL,
        updated_at = NOW()
    WHERE matched_group_id = p_group_id
    RETURNING id
  )
  SELECT count(*) INTO v_bank_count FROM reverted_bank;

  -- 2. Revert transaction journal lines to unreconciled
  WITH reverted_journal AS (
    UPDATE transaction_journal_line 
    SET is_reconciled = FALSE, 
        matched_group_id = NULL
    WHERE matched_group_id = p_group_id
    RETURNING id
  )
  SELECT count(*) INTO v_journal_count FROM reverted_journal;

  -- 3. Delete matching link record
  WITH deleted_match AS (
    DELETE FROM bank_reconciliation_match 
    WHERE match_group_id = p_group_id
    RETURNING id
  )
  SELECT count(*) INTO v_match_count FROM deleted_match;

  RETURN jsonb_build_object(
    'success', true,
    'group_id', p_group_id,
    'reverted_bank_lines', v_bank_count,
    'reverted_journal_lines', v_journal_count,
    'deleted_matches', v_match_count,
    'unmatched_at', NOW()
  );
END;
$$;
