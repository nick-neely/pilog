import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ClarificationQuestionsSection } from './DraftReview'

describe('ClarificationQuestionsSection', () => {
  it('renders clarification questions inline for clarification drafts', () => {
    const html = renderToStaticMarkup(
      createElement(ClarificationQuestionsSection, {
        draft: {
          workflowState: 'needs_clarification',
          clarificationQuestions: [
            'Which dashboard screen is affected?',
            'What value looks incorrect?'
          ],
          clarificationHistory: []
        },
        answers: {},
        onAnswerChange: () => {},
        onSubmitAnswer: async () => {}
      })
    )

    expect(html).toContain('Clarification Questions')
    expect(html).toContain('Which dashboard screen is affected?')
    expect(html).toContain('What value looks incorrect?')
    expect(html).toContain('Write an answer')
    expect(html).toContain('Save answer')
  })

  it('renders existing clarification history', () => {
    const html = renderToStaticMarkup(
      createElement(ClarificationQuestionsSection, {
        draft: {
          workflowState: 'needs_clarification',
          clarificationQuestions: ['Which dashboard screen is affected?'],
          clarificationHistory: [
            {
              question: 'Which dashboard screen is affected?',
              answer: 'The repository activity chart on the overview screen.',
              answeredAt: '2026-05-14T21:45:00.000Z'
            }
          ]
        }
      })
    )

    expect(html).toContain('Clarification History')
    expect(html).toContain('The repository activity chart on the overview screen.')
  })

  it('omits the section for publish-ready drafts', () => {
    const html = renderToStaticMarkup(
      createElement(ClarificationQuestionsSection, {
        draft: {
          workflowState: 'ready',
          clarificationQuestions: [],
          clarificationHistory: []
        }
      })
    )

    expect(html).toBe('')
  })
})
