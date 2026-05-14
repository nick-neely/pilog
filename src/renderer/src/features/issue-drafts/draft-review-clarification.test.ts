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
          ]
        }
      })
    )

    expect(html).toContain('Clarification Questions')
    expect(html).toContain('Which dashboard screen is affected?')
    expect(html).toContain('What value looks incorrect?')
  })

  it('omits the section for publish-ready drafts', () => {
    const html = renderToStaticMarkup(
      createElement(ClarificationQuestionsSection, {
        draft: {
          workflowState: 'ready',
          clarificationQuestions: []
        }
      })
    )

    expect(html).toBe('')
  })
})
