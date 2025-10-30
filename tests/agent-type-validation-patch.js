
// SECURITY PATCH: Agent Type Validation
// Generated on 2025-09-18T13:08:24.043Z

const VALID_AGENT_TYPES = [
    'coordinator', 'researcher', 'coder', 'analyst', 'architect',
    'tester', 'reviewer', 'optimizer'
];

const AGENT_TYPE_ALIASES = {
    'code-analyzer': 'coder',
    'data-analyst': 'analyst',
    'security-tester': 'tester',
    'performance-optimizer': 'optimizer',
    'qa-engineer': 'tester',
    'devops-engineer': 'optimizer',
    'system-architect': 'architect'
};

function validateAgentType(agentType) {
    if (!agentType || typeof agentType !== 'string') {
        throw new Error('Agent type must be a non-empty string');
    }

    const normalizedType = agentType.toLowerCase().trim();

    // Check exact match
    if (VALID_AGENT_TYPES.includes(normalizedType)) {
        return normalizedType;
    }

    // Check aliases
    if (AGENT_TYPE_ALIASES[normalizedType]) {
        return AGENT_TYPE_ALIASES[normalizedType];
    }

    // Check case-insensitive valid types
    const caseInsensitiveMatch = VALID_AGENT_TYPES.find(
        validType => validType.toLowerCase() === normalizedType
    );

    if (caseInsensitiveMatch) {
        return caseInsensitiveMatch;
    }

    // Generate suggestions
    const suggestions = [];
    for (const validType of VALID_AGENT_TYPES) {
        if (validType.includes(normalizedType) || normalizedType.includes(validType)) {
            suggestions.push(validType);
        }
    }

    const errorMessage = `Invalid agent type: '${agentType}'. Valid types: ${VALID_AGENT_TYPES.join(', ')}`;
    const suggestionMessage = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '';

    throw new Error(errorMessage + suggestionMessage);
}

module.exports = {
    validateAgentType,
    VALID_AGENT_TYPES,
    AGENT_TYPE_ALIASES
};
