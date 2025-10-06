/**
 * Mock Claude API for Testing and Development
 *
 * A realistic simulation of the Claude API for testing purposes without making actual API calls.
 * Provides deterministic responses, streaming support, and natural conversation flow.
 *
 * @module mockClaudeAPI
 */

import type {
  ClaudeAPIRequest,
  ClaudeAPIResponse,
  ClaudeAPIStreamChunk,
  Message,
  ChatContext,
} from '@/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Response template with keyword matching patterns.
 */
interface ResponseTemplate {
  keywords: string[];
  responses: string[];
  priority: number;
}

/**
 * Configuration options for the mock API.
 */
interface MockAPIConfig {
  minDelay: number;
  maxDelay: number;
  chunkDelay: number;
  enableThinking: boolean;
  seed?: number;
}

/**
 * Internal state for the mock API instance.
 */
interface MockAPIState {
  conversationHistory: Map<string, Message[]>;
  config: MockAPIConfig;
  randomSeed: number;
}

// ============================================================================
// Response Templates
// ============================================================================

/**
 * Comprehensive response templates organized by intent and keywords.
 * Responses are contextually aware of web elements and UI patterns.
 */
const RESPONSE_TEMPLATES: ResponseTemplate[] = [
  // Element identification and description
  {
    keywords: ['what', 'is', 'this', 'element', 'identify'],
    responses: [
      'This appears to be a {type} element. Based on its structure and styling, it serves as {purpose}. The element contains {content} and is likely used for {function}.',
      'I can see this is a {type} component. It\'s designed to {purpose} and appears to be part of {context}. The styling suggests it\'s meant to {visualPurpose}.',
      'Looking at this element, it\'s a {type} that provides {function}. The HTML structure indicates it\'s {purpose}, commonly used for {useCase}.',
    ],
    priority: 10,
  },
  // Summarization
  {
    keywords: ['summarize', 'summary', 'brief', 'overview', 'tldr'],
    responses: [
      'Here\'s a brief summary: This element represents {summary}. It contains {keyPoints} and serves the primary function of {mainPurpose}.',
      'In summary: This is a {type} that {function}. Key characteristics include {features}. It\'s typically used to {useCase}.',
      'Quick overview: The element is {description}. Main features are {features}, and it\'s designed for {purpose}.',
    ],
    priority: 9,
  },
  // Detailed explanation
  {
    keywords: ['explain', 'detail', 'how', 'why', 'works'],
    responses: [
      'Let me explain in detail. This element functions by {mechanism}. The structure consists of {components}, which work together to {purpose}. Users interact with it by {interaction}, and it responds by {response}.',
      'Here\'s a detailed breakdown: The element is built using {technology}. It operates by {operation}. The key components are {parts}, each serving to {function}. This design pattern is effective because {reasoning}.',
      'To explain thoroughly: This component implements {pattern}. The HTML structure reveals {structure}, while the styling indicates {design}. Functionally, it {behavior} when users {action}.',
    ],
    priority: 8,
  },
  // Style and design analysis
  {
    keywords: ['style', 'design', 'css', 'appearance', 'looks', 'visual'],
    responses: [
      'From a design perspective, this element uses {styles}. The visual hierarchy is established through {hierarchy}. The color scheme {colors} contributes to {effect}.',
      'The styling approach here employs {techniques}. Notable design choices include {choices}, which create {impression}. The layout uses {layout} to achieve {goal}.',
      'Design-wise, the element features {features}. The typography and spacing suggest {intent}. Overall, the aesthetic aims for {aesthetic}.',
    ],
    priority: 7,
  },
  // Purpose and function
  {
    keywords: ['purpose', 'function', 'use', 'for', 'role'],
    responses: [
      'The primary purpose of this element is {purpose}. It functions to {function} and helps users {userGoal}. In the broader context, it serves as {contextRole}.',
      'This element\'s function is to {function}. It plays a {role} role in the user interface, allowing users to {capability}. It\'s essential for {essentialFor}.',
      'Functionally, this component is designed to {design}. It enables {enables} and supports {supports}. Users rely on it to {userReliance}.',
    ],
    priority: 7,
  },
  // Interaction and behavior
  {
    keywords: ['interact', 'click', 'hover', 'behavior', 'action', 'response'],
    responses: [
      'For interactions, this element responds to {interactions}. When users {action}, it will {response}. The interactive behavior includes {behaviors}.',
      'User interaction works like this: {interactionFlow}. The element provides feedback through {feedback}. Common actions include {commonActions}.',
      'Interactive features include {features}. Users can {canDo}, and the element responds by {responds}. The interaction pattern follows {pattern}.',
    ],
    priority: 6,
  },
  // Code and implementation
  {
    keywords: ['code', 'html', 'implementation', 'build', 'create', 'develop'],
    responses: [
      'From an implementation standpoint, this element is constructed using {implementation}. The HTML structure includes {htmlStructure}, and key attributes are {attributes}.',
      'Code-wise, this component uses {codeStructure}. Important implementation details include {details}. To recreate this, you would need {requirements}.',
      'The technical implementation involves {technical}. The element\'s structure is {structure}, utilizing {utilizing} to achieve {achievement}.',
    ],
    priority: 6,
  },
  // Comparison and alternatives
  {
    keywords: ['compare', 'similar', 'alternative', 'instead', 'versus', 'different'],
    responses: [
      'Compared to similar elements, this one {comparison}. Alternative approaches could include {alternatives}. The key difference is {difference}.',
      'In comparison to {compareWith}, this element {differentiator}. You might consider {consideration} as an alternative. Each approach has {tradeoffs}.',
      'Similar patterns include {similarPatterns}, but this implementation {uniqueness}. Alternative designs might {alternatives}.',
    ],
    priority: 5,
  },
  // Accessibility
  {
    keywords: ['accessibility', 'a11y', 'accessible', 'screen reader', 'wcag', 'aria'],
    responses: [
      'From an accessibility perspective, this element {accessibilityFeatures}. It should include {shouldInclude} to be fully accessible. Screen readers would {srBehavior}.',
      'Accessibility considerations: {considerations}. The element needs {needs} to meet WCAG standards. Current implementation {currentState}.',
      'For accessibility, this component {accessibilityStatus}. Key requirements include {requirements}. Users with assistive technology would {atExperience}.',
    ],
    priority: 8,
  },
  // Performance and optimization
  {
    keywords: ['performance', 'optimize', 'speed', 'fast', 'slow', 'efficient'],
    responses: [
      'Performance-wise, this element {performance}. Optimization opportunities include {optimizations}. The current approach {currentApproach}.',
      'From a performance standpoint, {performanceAnalysis}. To improve speed, consider {improvements}. The element\'s efficiency {efficiency}.',
      'Optimization potential: {potential}. Current performance characteristics are {characteristics}. Suggested improvements include {suggestions}.',
    ],
    priority: 5,
  },
  // Content analysis
  {
    keywords: ['content', 'text', 'contains', 'information', 'data'],
    responses: [
      'The content of this element includes {content}. The information is structured as {structure}. Key data points are {dataPoints}.',
      'Content-wise, this element presents {presents}. The textual content {textualContent}, and the information hierarchy is {hierarchy}.',
      'Analyzing the content: {analysis}. The element contains {contains}, organized as {organization}.',
    ],
    priority: 6,
  },
  // Improvement suggestions
  {
    keywords: ['improve', 'better', 'enhance', 'suggestion', 'recommend'],
    responses: [
      'To improve this element, I would suggest {suggestions}. Enhancements could include {enhancements}. These changes would {benefits}.',
      'Improvement opportunities: {opportunities}. Consider {considerations} to enhance {enhanceWhat}. The benefits would be {benefits}.',
      'For better results, you could {couldDo}. Recommended enhancements are {recommendations}. This would improve {improvements}.',
    ],
    priority: 7,
  },
  // General help and questions
  {
    keywords: ['help', 'question', 'tell', 'know', 'information'],
    responses: [
      'I\'d be happy to help. This element {generalInfo}. What specific aspect would you like to know more about?',
      'Let me provide some information. This component {componentInfo}. Is there a particular detail you\'re interested in?',
      'Sure, I can help with that. The element {elementInfo}. What would you like to explore further?',
    ],
    priority: 4,
  },
  // Default/fallback responses
  {
    keywords: [],
    responses: [
      'Looking at this element, it appears to be {type} with {characteristics}. It serves {function} and is part of {context}.',
      'This is an interesting element. It features {features} and is designed to {design}. The implementation shows {implementation}.',
      'Based on the structure, this element is {description}. It\'s characterized by {characteristics} and functions as {function}.',
      'I can see this component {observation}. It\'s built to {purpose} and displays {displays}.',
    ],
    priority: 1,
  },
];

// ============================================================================
// Mock Claude API Class
// ============================================================================

/**
 * MockClaudeAPI provides a realistic simulation of the Claude API for testing
 * and development purposes.
 *
 * Features:
 * - Deterministic responses based on seeding
 * - Streaming support with configurable delays
 * - Context-aware responses analyzing keywords
 * - Conversation history tracking
 * - Natural response variations
 *
 * @example
 * ```typescript
 * const api = new MockClaudeAPI({ seed: 12345 });
 * const response = await api.sendMessage("What is this?", context);
 * ```
 */
export class MockClaudeAPI {
  private state: MockAPIState;

  /**
   * Creates a new MockClaudeAPI instance.
   *
   * @param config - Configuration options for the mock API
   */
  constructor(config: Partial<MockAPIConfig> = {}) {
    this.state = {
      conversationHistory: new Map(),
      config: {
        minDelay: config.minDelay ?? 500,
        maxDelay: config.maxDelay ?? 2000,
        chunkDelay: config.chunkDelay ?? 50,
        enableThinking: config.enableThinking ?? true,
        seed: config.seed,
      },
      randomSeed: config.seed ?? Date.now(),
    };
  }

  /**
   * Sends a message and returns a complete response.
   *
   * @param message - The user's message
   * @param context - Optional chat context with conversation history
   * @returns Promise resolving to the assistant's response
   *
   * @example
   * ```typescript
   * const response = await api.sendMessage("Explain this button", {
   *   cardId: "card-123",
   *   messages: [...],
   *   isStreaming: false,
   *   currentInput: ""
   * });
   * ```
   */
  async sendMessage(message: string, context?: ChatContext): Promise<string> {
    // Update conversation history
    if (context?.cardId) {
      const history = this.state.conversationHistory.get(context.cardId) || [];
      history.push(...context.messages);
      this.state.conversationHistory.set(context.cardId, history);
    }

    // Simulate network delay
    await this.delay(this.getRandomDelay());

    // Generate response
    const response = this.generateResponse(message, context);

    // Add to conversation history
    if (context?.cardId) {
      const history = this.state.conversationHistory.get(context.cardId) || [];
      history.push({
        id: this.generateId(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      });
      this.state.conversationHistory.set(context.cardId, history);
    }

    return response;
  }

  /**
   * Creates a streaming response generator.
   *
   * Yields response chunks character by character or word by word with
   * realistic delays to simulate streaming behavior.
   *
   * @param message - The user's message
   * @param context - Optional chat context with conversation history
   * @yields Stream chunks following the ClaudeAPIStreamChunk format
   *
   * @example
   * ```typescript
   * for await (const chunk of api.createStreamingResponse("Summarize this", context)) {
   *   if (chunk.type === 'content_block_delta' && chunk.delta) {
   *     process.stdout.write(chunk.delta.text);
   *   }
   * }
   * ```
   */
  async *createStreamingResponse(
    message: string,
    context?: ChatContext
  ): AsyncGenerator<ClaudeAPIStreamChunk, void, unknown> {
    // Update conversation history
    if (context?.cardId) {
      const history = this.state.conversationHistory.get(context.cardId) || [];
      history.push(...context.messages);
      this.state.conversationHistory.set(context.cardId, history);
    }

    // Initial delay
    await this.delay(this.getRandomDelay() / 2);

    // Optional thinking indicator
    if (this.state.config.enableThinking && this.seededRandom() > 0.7) {
      yield {
        type: 'content_block_delta',
        delta: { text: '...' },
      };
      await this.delay(this.state.config.chunkDelay * 5);
    }

    // Generate full response
    const fullResponse = this.generateResponse(message, context);

    // Stream response word by word
    const words = fullResponse.split(' ');
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const textChunk = i === words.length - 1 ? word : word + ' ';

      yield {
        type: 'content_block_delta',
        delta: { text: textChunk },
      };

      // Variable delay based on word length
      const delay = this.state.config.chunkDelay * (1 + textChunk.length / 20);
      await this.delay(delay);
    }

    // Signal completion
    yield {
      type: 'message_stop',
    };

    // Add to conversation history
    if (context?.cardId) {
      const history = this.state.conversationHistory.get(context.cardId) || [];
      history.push({
        id: this.generateId(),
        role: 'assistant',
        content: fullResponse,
        timestamp: Date.now(),
      });
      this.state.conversationHistory.set(context.cardId, history);
    }
  }

  /**
   * Sends a message using the ClaudeAPIRequest format.
   *
   * @param request - Formatted API request
   * @returns Promise resolving to ClaudeAPIResponse
   *
   * @example
   * ```typescript
   * const response = await api.sendRequest({
   *   messages: [...],
   *   maxTokens: 1000,
   *   stream: false
   * });
   * ```
   */
  async sendRequest(request: ClaudeAPIRequest): Promise<ClaudeAPIResponse> {
    const lastMessage = request.messages[request.messages.length - 1];
    const content = lastMessage?.content || '';

    const response = await this.sendMessage(content);

    return {
      id: this.generateId(),
      content: response,
      role: 'assistant',
      stopReason: 'end_turn',
    };
  }

  /**
   * Generates a contextually relevant response based on message analysis.
   *
   * @private
   * @param message - User's input message
   * @param context - Optional chat context
   * @returns Generated response string
   */
  private generateResponse(message: string, context?: ChatContext): string {
    const lowerMessage = message.toLowerCase();

    // Find matching template based on keywords
    const matchedTemplate = this.findBestTemplate(lowerMessage);

    // Select a response variant
    const responseTemplate = this.selectResponse(matchedTemplate.responses);

    // Fill in template placeholders with contextual information
    const filledResponse = this.fillTemplate(responseTemplate, message, context);

    return filledResponse;
  }

  /**
   * Finds the best matching response template based on keyword analysis.
   *
   * @private
   * @param message - Lowercased message
   * @returns Best matching template
   */
  private findBestTemplate(message: string): ResponseTemplate {
    let bestTemplate = RESPONSE_TEMPLATES[RESPONSE_TEMPLATES.length - 1]; // Default
    let bestScore = 0;

    for (const template of RESPONSE_TEMPLATES) {
      let score = 0;

      for (const keyword of template.keywords) {
        if (message.includes(keyword)) {
          score += 1;
        }
      }

      // Weight by priority
      score *= template.priority;

      if (score > bestScore) {
        bestScore = score;
        bestTemplate = template;
      }
    }

    return bestTemplate;
  }

  /**
   * Selects a random response from the available variants.
   *
   * @private
   * @param responses - Array of response variants
   * @returns Selected response string
   */
  private selectResponse(responses: string[]): string {
    const index = Math.floor(this.seededRandom() * responses.length);
    return responses[index];
  }

  /**
   * Fills template placeholders with contextual information.
   *
   * @private
   * @param template - Response template string
   * @param message - Original user message
   * @param context - Optional chat context
   * @returns Filled template string
   */
  private fillTemplate(
    template: string,
    message: string,
    context?: ChatContext
  ): string {
    const placeholders: Record<string, string[]> = {
      type: [
        'button',
        'navigation link',
        'form input',
        'card component',
        'list item',
        'heading',
        'text block',
        'image container',
        'interactive widget',
        'dropdown menu',
      ],
      purpose: [
        'presenting information to users',
        'facilitating navigation',
        'collecting user input',
        'displaying content in an organized manner',
        'enabling user interaction',
        'providing visual hierarchy',
        'organizing related content',
        'enhancing user engagement',
      ],
      content: [
        'text, images, and interactive elements',
        'structured data and metadata',
        'user-generated content',
        'formatted text with styling',
        'media elements and captions',
        'hierarchical information',
      ],
      function: [
        'user interaction and feedback',
        'content display and organization',
        'navigation between sections',
        'data collection and submission',
        'visual communication',
        'state management',
      ],
      context: [
        'a larger user interface',
        'the main content area',
        'a navigation system',
        'a data presentation layer',
        'an interactive dashboard',
        'a content management system',
      ],
      visualPurpose: [
        'draw attention to important actions',
        'provide clear visual hierarchy',
        'maintain consistent branding',
        'guide users through the interface',
        'create an intuitive user experience',
      ],
      useCase: [
        'user engagement and interaction',
        'information architecture',
        'responsive web design',
        'accessibility features',
        'dynamic content display',
      ],
      summary: [
        'a key interface component',
        'an interactive element for user engagement',
        'a content container with structured information',
        'a navigational element for site flow',
      ],
      keyPoints: [
        'semantic HTML markup, styled content, and interactive capabilities',
        'clear visual hierarchy and intuitive interaction patterns',
        'accessibility features and responsive design considerations',
      ],
      mainPurpose: [
        'facilitating user interactions',
        'presenting information effectively',
        'organizing content logically',
        'enabling seamless navigation',
      ],
      features: [
        'responsive layout, semantic markup, and accessible design',
        'interactive states, visual feedback, and intuitive controls',
        'clean styling, consistent branding, and clear typography',
      ],
      description: [
        'a well-structured interface component',
        'a thoughtfully designed interactive element',
        'a content presentation module',
      ],
      mechanism: [
        'combining HTML structure with CSS styling and JavaScript interactivity',
        'leveraging browser APIs and event handling',
        'utilizing modern web standards and best practices',
      ],
      components: [
        'semantic HTML elements, styled containers, and interactive controls',
        'text content, visual assets, and functional elements',
        'structural markup, presentation layers, and behavior scripts',
      ],
      interaction: [
        'clicking, tapping, or keyboard navigation',
        'hovering, focusing, or gesture-based actions',
        'direct manipulation or voice commands',
      ],
      response: [
        'providing immediate visual feedback',
        'triggering state changes or navigation',
        'updating content dynamically',
      ],
      technology: [
        'HTML5, CSS3, and modern JavaScript',
        'semantic web technologies and ARIA attributes',
        'responsive design patterns and progressive enhancement',
      ],
      operation: [
        'responding to user events and managing state',
        'rendering content dynamically based on data',
        'coordinating with other interface components',
      ],
      parts: [
        'container elements, content areas, and interactive controls',
        'headings, body text, and media elements',
        'navigation elements, form fields, and action buttons',
      ],
      pattern: [
        'a common UI design pattern',
        'established interaction paradigms',
        'modern web component architecture',
      ],
      structure: [
        'a hierarchical DOM structure with nested elements',
        'semantic markup following web standards',
        'modular components with clear responsibilities',
      ],
      design: [
        'intentional spacing and visual rhythm',
        'a cohesive color scheme and typography',
        'responsive breakpoints and flexible layouts',
      ],
      behavior: [
        'responds to user input',
        'updates its state dynamically',
        'communicates with other components',
      ],
      action: [
        'interact with the interface',
        'provide input or make selections',
        'navigate through the application',
      ],
      styles: [
        'modern CSS techniques including flexbox and grid',
        'custom properties for theming and consistency',
        'responsive units and media queries',
      ],
      hierarchy: [
        'font sizing, weight variations, and color contrast',
        'spacing systems and alignment principles',
        'layering and depth through shadows and borders',
      ],
      colors: [
        'following brand guidelines',
        'providing good contrast and accessibility',
        'creating visual interest and hierarchy',
      ],
      effect: [
        'a professional and polished appearance',
        'clear visual communication',
        'an engaging user experience',
      ],
      techniques: [
        'CSS Grid for layout, Flexbox for alignment, and custom properties for theming',
        'responsive design patterns with mobile-first approach',
        'progressive enhancement and graceful degradation',
      ],
      choices: [
        'generous whitespace, clear typography, and intuitive controls',
        'consistent spacing, accessible colors, and recognizable patterns',
        'modern aesthetics, functional minimalism, and user-centered design',
      ],
      impression: [
        'a clean and professional interface',
        'an intuitive and approachable experience',
        'a modern and sophisticated design',
      ],
      layout: [
        'CSS Grid for two-dimensional layouts',
        'Flexbox for flexible one-dimensional arrangements',
        'a combination of positioning techniques',
      ],
      goal: [
        'optimal content presentation',
        'intuitive user navigation',
        'responsive adaptation across devices',
      ],
      intent: [
        'readability and visual clarity',
        'a comfortable information density',
        'clear content hierarchy',
      ],
      aesthetic: [
        'a modern, clean interface',
        'a professional yet approachable feel',
        'balance between form and function',
      ],
      userGoal: [
        'accomplish their tasks efficiently',
        'access information quickly',
        'interact with the application seamlessly',
      ],
      contextRole: [
        'a crucial part of the user workflow',
        'a key touchpoint in the user journey',
        'an essential component of the interface',
      ],
      role: [
        'central',
        'supporting',
        'essential',
        'foundational',
        'critical',
      ],
      capability: [
        'perform specific actions',
        'access detailed information',
        'customize their experience',
      ],
      essentialFor: [
        'completing core user tasks',
        'maintaining application functionality',
        'ensuring a smooth user experience',
      ],
      enables: [
        'efficient task completion',
        'seamless content interaction',
        'intuitive application navigation',
      ],
      supports: [
        'the overall user experience',
        'key application workflows',
        'important user objectives',
      ],
      userReliance: [
        'navigate the application',
        'complete critical tasks',
        'access important features',
      ],
      interactions: [
        'mouse clicks, keyboard inputs, and touch gestures',
        'hover states, focus indicators, and active states',
        'various user input methods',
      ],
      interactionFlow: [
        'users interact with the element, receive feedback, and observe the result',
        'the element detects user input, processes it, and updates accordingly',
        'input is captured, validated, and triggers appropriate responses',
      ],
      feedback: [
        'visual changes, state updates, and confirmation messages',
        'animations, transitions, and status indicators',
        'immediate visual cues and progress indicators',
      ],
      commonActions: [
        'clicking to activate, hovering for details, and dragging to reorder',
        'selecting options, inputting data, and submitting forms',
        'navigating, filtering, and customizing',
      ],
      canDo: [
        'click, tap, or activate using keyboard',
        'hover to reveal additional information',
        'interact in multiple ways depending on context',
      ],
      responds: [
        'updating its visual state',
        'triggering associated functionality',
        'providing clear feedback',
      ],
      implementation: [
        'standard HTML elements with enhanced styling',
        'custom components following web component standards',
        'framework-specific implementations',
      ],
      htmlStructure: [
        'semantic elements with appropriate ARIA attributes',
        'nested containers for layout control',
        'accessible markup with proper roles',
      ],
      attributes: [
        'data attributes for state management',
        'ARIA labels for accessibility',
        'class names for styling hooks',
      ],
      codeStructure: [
        'modular components with clear separation of concerns',
        'reusable patterns and composable elements',
        'maintainable code with good documentation',
      ],
      details: [
        'event listeners for interactivity',
        'state management for dynamic updates',
        'proper error handling and edge cases',
      ],
      requirements: [
        'HTML for structure, CSS for presentation, JavaScript for behavior',
        'appropriate frameworks or libraries',
        'understanding of web standards and best practices',
      ],
      technical: [
        'modern web technologies and standards',
        'responsive design principles',
        'progressive enhancement strategies',
      ],
      utilizing: [
        'CSS custom properties and modern selectors',
        'JavaScript ES6+ features',
        'web APIs and browser capabilities',
      ],
      achievement: [
        'the desired functionality',
        'optimal user experience',
        'maintainable and scalable code',
      ],
      comparison: [
        'stands out due to its unique approach',
        'follows common patterns with custom enhancements',
        'implements a variation on standard designs',
      ],
      alternatives: [
        'different layout approaches, alternative interaction patterns, or varied styling techniques',
        'using different frameworks, libraries, or vanilla approaches',
        'simpler or more complex implementations depending on requirements',
      ],
      difference: [
        'the specific implementation details and design choices',
        'how it handles edge cases and user interactions',
        'the balance between functionality and simplicity',
      ],
      compareWith: [
        'standard UI components',
        'common design patterns',
        'alternative implementations',
      ],
      differentiator: [
        'offers unique functionality',
        'provides better user experience',
        'implements a more maintainable approach',
      ],
      consideration: [
        'alternative design patterns',
        'different technical approaches',
        'simplified or enhanced variations',
      ],
      tradeoffs: [
        'complexity versus simplicity',
        'flexibility versus constraints',
        'performance versus features',
      ],
      similarPatterns: [
        'common UI components like cards, modals, and menus',
        'established design patterns from major frameworks',
        'industry-standard interface elements',
      ],
      uniqueness: [
        'adds custom functionality',
        'adapts the pattern to specific needs',
        'enhances standard behavior',
      ],
      accessibilityFeatures: [
        'includes ARIA labels and roles',
        'supports keyboard navigation',
        'provides proper semantic structure',
      ],
      shouldInclude: [
        'ARIA attributes, keyboard support, and screen reader announcements',
        'proper focus management, skip links, and visible focus indicators',
        'semantic HTML, sufficient color contrast, and text alternatives',
      ],
      srBehavior: [
        'announce the element\'s purpose and state',
        'provide context and navigation cues',
        'convey dynamic changes and updates',
      ],
      considerations: [
        'semantic HTML usage, ARIA implementation, and keyboard support',
        'color contrast ratios, focus indicators, and screen reader compatibility',
        'alternative text, captions, and text alternatives for non-text content',
      ],
      needs: [
        'proper ARIA labels, roles, and states',
        'keyboard accessibility and focus management',
        'sufficient color contrast and text alternatives',
      ],
      currentState: [
        'appears to have basic accessibility features',
        'could benefit from accessibility enhancements',
        'follows some but not all accessibility best practices',
      ],
      accessibilityStatus: [
        'has accessibility considerations',
        'implements some accessibility features',
        'would benefit from accessibility improvements',
      ],
      accessibilityRequirements: [
        'semantic markup, ARIA attributes, and keyboard support',
        'proper contrast ratios and focus indicators',
        'screen reader announcements and alternative text',
      ],
      atExperience: [
        'receive appropriate announcements and context',
        'navigate using standard keyboard patterns',
        'access all functionality without barriers',
      ],
      performance: [
        'appears optimized for modern browsers',
        'could benefit from performance optimizations',
        'uses efficient rendering techniques',
      ],
      optimizations: [
        'lazy loading, code splitting, and resource compression',
        'reducing DOM complexity and minimizing reflows',
        'optimizing CSS selectors and JavaScript execution',
      ],
      currentApproach: [
        'uses standard techniques with room for optimization',
        'balances functionality and performance well',
        'could be enhanced with modern optimization strategies',
      ],
      performanceAnalysis: [
        'the element renders efficiently in most scenarios',
        'performance depends on content size and complexity',
        'modern browsers handle it well',
      ],
      performanceImprovements: [
        'implementing virtual scrolling for large lists',
        'using CSS containment for isolated updates',
        'optimizing JavaScript execution and event handlers',
      ],
      efficiency: [
        'is adequate for typical use cases',
        'could be improved with optimization',
        'benefits from browser optimizations',
      ],
      potential: [
        'code splitting, lazy loading, and caching strategies',
        'reducing bundle size and optimizing assets',
        'improving render performance and responsiveness',
      ],
      characteristics: [
        'reasonable render times and smooth interactions',
        'acceptable memory usage and CPU load',
        'good responsiveness under normal conditions',
      ],
      performanceSuggestions: [
        'profiling with browser dev tools and implementing targeted fixes',
        'reducing unnecessary re-renders and optimizing state updates',
        'using performance budgets and monitoring',
      ],
      contentData: [
        'text, images, links, and interactive elements',
        'structured data with semantic meaning',
        'user-facing information and metadata',
      ],
      presents: [
        'information in a clear, organized manner',
        'data using appropriate formatting',
        'content with proper hierarchy',
      ],
      textualContent: [
        'provides clear communication',
        'follows readability best practices',
        'uses appropriate tone and language',
      ],
      analysis: [
        'the content is well-structured and purposeful',
        'information is organized logically',
        'text is clear and understandable',
      ],
      contains: [
        'meaningful text and supporting media',
        'data organized for easy consumption',
        'interactive elements for user engagement',
      ],
      organization: [
        'a clear hierarchy with headings and sections',
        'logical grouping of related information',
        'progressive disclosure of details',
      ],
      improvementSuggestions: [
        'enhancing accessibility features',
        'improving responsive behavior',
        'adding loading states and error handling',
        'optimizing for performance',
        'implementing better user feedback',
      ],
      enhancements: [
        'smoother animations and transitions',
        'better error messages and validation',
        'improved mobile experience',
        'enhanced keyboard navigation',
      ],
      benefits: [
        'result in better user experience',
        'improve accessibility and usability',
        'enhance overall quality',
      ],
      opportunities: [
        'accessibility improvements, performance optimization, and enhanced UX',
        'code quality enhancements and better documentation',
        'responsive design refinements and progressive enhancement',
      ],
      enhanceWhat: [
        'user experience',
        'accessibility',
        'performance',
        'maintainability',
      ],
      couldDo: [
        'add more interactive features',
        'improve visual design',
        'enhance accessibility',
        'optimize performance',
      ],
      recommendations: [
        'following established design patterns',
        'implementing comprehensive testing',
        'adding proper documentation',
        'optimizing for various devices',
      ],
      qualityImprovements: [
        'user satisfaction and engagement',
        'accessibility and inclusivity',
        'code quality and maintainability',
      ],
      generalInfo: [
        'represents a common UI pattern',
        'serves an important function in the interface',
        'is part of a larger system',
      ],
      componentInfo: [
        'is a standard web interface element',
        'follows common design patterns',
        'provides essential functionality',
      ],
      elementInfo: [
        'is part of the user interface',
        'serves a specific purpose',
        'interacts with users in meaningful ways',
      ],
      elementCharacteristics: [
        'standard HTML structure and CSS styling',
        'interactive capabilities and responsive design',
        'semantic markup and accessible features',
      ],
      observation: [
        'appears to be a functional interface element',
        'demonstrates good design principles',
        'serves its intended purpose effectively',
      ],
      displays: [
        'information in a user-friendly manner',
        'content with appropriate styling',
        'interactive elements for engagement',
      ],
    };

    let result = template;

    // Replace all placeholders
    for (const [key, values] of Object.entries(placeholders)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      const value = values[Math.floor(this.seededRandom() * values.length)];
      result = result.replace(regex, value);
    }

    return result;
  }

  /**
   * Generates a random delay within the configured range.
   *
   * @private
   * @returns Delay in milliseconds
   */
  private getRandomDelay(): number {
    const { minDelay, maxDelay } = this.state.config;
    return minDelay + this.seededRandom() * (maxDelay - minDelay);
  }

  /**
   * Generates a seeded pseudo-random number between 0 and 1.
   * Uses a simple LCG (Linear Congruential Generator) for determinism.
   *
   * @private
   * @returns Random number between 0 and 1
   */
  private seededRandom(): number {
    this.state.randomSeed = (this.state.randomSeed * 9301 + 49297) % 233280;
    return this.state.randomSeed / 233280;
  }

  /**
   * Creates a delay promise.
   *
   * @private
   * @param ms - Milliseconds to delay
   * @returns Promise that resolves after the delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generates a unique ID for messages and responses.
   *
   * @private
   * @returns Unique identifier string
   */
  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Clears conversation history for a specific card or all cards.
   *
   * @param cardId - Optional card ID to clear. If not provided, clears all history.
   */
  clearHistory(cardId?: string): void {
    if (cardId) {
      this.state.conversationHistory.delete(cardId);
    } else {
      this.state.conversationHistory.clear();
    }
  }

  /**
   * Gets conversation history for a specific card.
   *
   * @param cardId - Card ID to retrieve history for
   * @returns Array of messages or empty array if not found
   */
  getHistory(cardId: string): Message[] {
    return this.state.conversationHistory.get(cardId) || [];
  }

  /**
   * Updates the configuration.
   *
   * @param config - Partial configuration to merge with existing config
   */
  updateConfig(config: Partial<MockAPIConfig>): void {
    this.state.config = { ...this.state.config, ...config };
  }

  /**
   * Resets the random seed for deterministic testing.
   *
   * @param seed - New seed value
   */
  setSeed(seed: number): void {
    this.state.randomSeed = seed;
    this.state.config.seed = seed;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Default singleton instance of MockClaudeAPI.
 * Use this for simple cases where you don't need custom configuration.
 *
 * @example
 * ```typescript
 * import { mockClaudeAPI } from './mockClaudeAPI';
 *
 * const response = await mockClaudeAPI.sendMessage("What is this?");
 * ```
 */
export const mockClaudeAPI = new MockClaudeAPI();

// ============================================================================
// Exports
// ============================================================================

export type { MockAPIConfig };
