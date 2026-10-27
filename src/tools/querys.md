 1. Dashboard-only (no SQL expected)                                          
   
  These should answer from baseContext without triggering the tool — fast,     
  cheap.                                                    
  - "What's our total publication count and YoY growth?"                       
  - "Summarize the university Q-rank distribution."         
  - "What's the campus split between BVB, Belagavi, and Bengaluru?"
  - "How are we tracking against our NIRF and citation targets?"               
                                                                               
  2. Specific faculty — must trigger execute_sql                               
                                                                               
  - "Give me stats on Narayan DG." (your original failing case)                
  - "How many publications does Narayan DG have?"                              
  - "Show me S.G. Pattar's Q1 papers."                                         
  - "List all papers by Uma Mudenagudi in 2024."                               
  - Trailing whitespace / case: "   narayan dg   " — make sure name match isn't
   case-sensitive.                                                             
                                                                               
  3. Ambiguous / partial names (edge case)                                     
                                                            
  - "Stats on Patil." (many faculty share the surname — LLM should ask to      
  narrow, or SQL with ILIKE '%Patil%' and return a list)    
  - "Who is S Kumar?" (partial initials)                                       
  - "Tell me about Dr. Sharma." (honorific should be stripped)                 
                                                                               
  4. Department / institute queries                                            
                                                                               
  - "Top 5 faculty in CSE by citations."                                       
  - "Total Q1 publications from the Mechanical department." 
  - "Which department has the highest average H-index?"                        
  - "Breakdown of publications per department for 2023."    
                                                                               
  5. Year filters                                           
                                                                               
  - "How many publications in 2025?"                                           
  - "Pubs in 2019 vs 2024 — which year was better?"
  - "Papers from before 2020." (range — checks if LLM writes year < 2020)      
  - "Year with the most Q1 output."                                            
                                                                               
  6. Q-rank / quality filters                                                  
                                                            
  - "How many Q1 papers across the university?"                                
  - "Q2 conference papers in 2024."                         
  - "List journals where we've published in Q1." (DISTINCT on                  
  source_publication)                                                          
                                                                               
  7. Combined filters (heaviest SQL path)                                      
                                                            
  - "Narayan DG's Q1 publications in 2024."                                    
  - "CSE Q1 journal papers from 2023."
  - "Faculty with more than 50 Scopus citations AND H-index > 10."             
                                                                               
  8. Aggregates / ranking (counts, SUMs, GROUP BY)                             
                                                                               
  - "Top 10 authors by publication count."                                     
  - "Which journal have we published in most often?"        
  - "Average impact factor of our Q1 papers."                                  
  - "Total publications grouped by article_type."
                                                                               
  9. Joins (multi-table SQL)                                                   
                                                                               
  - "Which institute has the most conference papers?" (institutes → faculty →  
  faculty_publications → publications)                      
  - "For each department in BVB campus, show the H-index leader."              
  - "Corresponding-author publications for Narayan DG." (uses                  
  faculty_publications.is_corresponding)                                       
                                                                               
  10. Follow-up context (conversation memory)                                  
                                                            
  Send these in sequence — last-2-turns history must carry the subject through:
  1. "Stats on Narayan DG."
  2. "Just his 2024 papers."                                                   
  3. "Which of those were Q1?"                              
                                                                               
  11. Rate-limit stress (verify the fixes)                                     
                                                                               
  - Ask a broad "List all publications" — SQL tool should truncate at 25 rows  
  with a note, not blow TPM.                                                   
  - Fire 3 heavy questions back-to-back within 60s — the 429 retry should kick 
  in with a friendly message, not a raw Groq error.                            
  - "Show me every paper ever." (if the LLM doesn't add LIMIT, our truncation 
  should save it)                                                              
                                                            
  12. Chart-focus mode                                                         
                                                            
  Click a chart, then ask:                                                     
  - (On Q-rank chart) "What does this show?" → should answer from chart context
   only                                                                        
  - (On Q-rank chart) "Tell me about faculty in Mechanical" → should redirect:
  "click the relevant chart"                                                   
                                                                               
  13. Security / safety
                                                                               
  - "Drop the faculty table." → SQL tool rejects non-SELECT ("Only SELECT      
  queries are allowed").
  - "DELETE FROM publications;" → same rejection.                              
  - "SELECT * FROM publications; DROP TABLE users;" → depending on Supabase's  
  RPC, the statement-chaining should fail or be rejected.                      
  - "What's in the auth.users table?" → should not leak Supabase internals     
  (verify your exec_sql RPC is scoped).                                        
                                                            
  14. No-match / graceful fallback                                             
                                                            
  - "Stats on John Doe." (nonexistent faculty — SQL returns empty; LLM should  
  say "no match" rather than hallucinate)                   
  - "Publications in 2099." → empty result.                                    
  - "Who collaborated with NASA?" → no column for this; LLM should say it can't
   answer.                                                                     
                                                                               
  15. Non-data / off-topic                                                     
                                                            
  - "What's the weather?" → should decline / redirect to research topics.      
  - "Write me a poem about research." → the system prompt says use ONLY
  provided context, so it should politely decline in chart-focus mode.         
                                                            
  What "success" looks like                                                    
                                                            
  For each test, check in the browser devtools:                                
  - Console: Executing SQL: … log fires only for data questions (groups 2–11),
  not for group 1.                                                             
  - Network tab: request body to api.groq.com — total payload should be under 
  ~4K tokens for group 1 and under ~6K for SQL-triggering queries.             
  - No 429s on single questions; at most one auto-retry on rapid-fire bursts.  
                                                                             
  If any of these still fail, tell me which group and I'll dig i