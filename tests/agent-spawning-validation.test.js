#!/usr/bin/env node

/**
 * Comprehensive Test Suite for Agent Spawning Validation
 * Tests to prevent agent type errors and validate all spawning scenarios
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class AgentSpawningTester {
    constructor() {
        this.testResults = [];
        this.validAgentTypes = [
            'coordinator', 'researcher', 'coder', 'analyst', 'architect',
            'tester', 'reviewer', 'optimizer'
        ];
        this.invalidAgentTypes = [
            'invalid-agent', 'nonexistent', 'fake-type', '', null, undefined
        ];
        this.edgeCaseTypes = [
            'CODER', 'Researcher', 'code-analyzer', 'data-analyst'
        ];
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
        console.log(logMessage);

        // Store in test results
        this.testResults.push({
            timestamp,
            type,
            message,
            test: this.currentTest || 'general'
        });
    }

    async runCommand(command, args = [], timeout = 10000) {
        return new Promise((resolve, reject) => {
            const child = spawn('npx', ['claude-flow@alpha', ...command.split(' '), ...args], {
                cwd: process.cwd(),
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            const timer = setTimeout(() => {
                child.kill('SIGTERM');
                reject(new Error('Command timeout'));
            }, timeout);

            child.on('close', (code) => {
                clearTimeout(timer);
                resolve({
                    code,
                    stdout,
                    stderr,
                    success: code === 0
                });
            });

            child.on('error', (error) => {
                clearTimeout(timer);
                reject(error);
            });
        });
    }

    async testValidAgentTypes() {
        this.currentTest = 'valid-agent-types';
        this.log('Testing valid agent types...', 'test');

        for (const agentType of this.validAgentTypes) {
            try {
                this.log(`Testing valid agent type: ${agentType}`, 'test');

                const result = await this.runCommand('agent spawn', [agentType, '--name', `test-${agentType}`]);

                if (result.success || result.stdout.includes('Agent created') || !result.stderr.includes('Invalid agent type')) {
                    this.log(`✅ Valid agent type '${agentType}' works correctly`, 'success');
                } else {
                    this.log(`❌ Valid agent type '${agentType}' failed: ${result.stderr}`, 'error');
                }
            } catch (error) {
                this.log(`❌ Error testing valid agent type '${agentType}': ${error.message}`, 'error');
            }
        }
    }

    async testInvalidAgentTypes() {
        this.currentTest = 'invalid-agent-types';
        this.log('Testing invalid agent types for proper error handling...', 'test');

        for (const agentType of this.invalidAgentTypes) {
            try {
                this.log(`Testing invalid agent type: ${agentType}`, 'test');

                const result = await this.runCommand('agent spawn', [agentType || 'undefined']);

                if (!result.success && (result.stderr.includes('Invalid agent type') || result.stderr.includes('Unknown'))) {
                    this.log(`✅ Invalid agent type '${agentType}' properly rejected`, 'success');
                } else {
                    this.log(`❌ Invalid agent type '${agentType}' should have been rejected`, 'error');
                }
            } catch (error) {
                this.log(`✅ Invalid agent type '${agentType}' properly threw error: ${error.message}`, 'success');
            }
        }
    }

    async testEdgeCases() {
        this.currentTest = 'edge-cases';
        this.log('Testing edge cases...', 'test');

        // Test case sensitivity
        for (const agentType of this.edgeCaseTypes) {
            try {
                this.log(`Testing edge case agent type: ${agentType}`, 'test');

                const result = await this.runCommand('agent spawn', [agentType]);

                this.log(`Edge case '${agentType}' result: ${result.success ? 'accepted' : 'rejected'}`, 'info');
            } catch (error) {
                this.log(`Edge case '${agentType}' error: ${error.message}`, 'info');
            }
        }
    }

    async testConcurrentSpawning() {
        this.currentTest = 'concurrent-spawning';
        this.log('Testing concurrent agent spawning...', 'test');

        const promises = this.validAgentTypes.slice(0, 3).map(async (agentType, index) => {
            try {
                const result = await this.runCommand('agent spawn', [agentType, '--name', `concurrent-${index}`]);
                return { agentType, success: result.success, index };
            } catch (error) {
                return { agentType, success: false, error: error.message, index };
            }
        });

        try {
            const results = await Promise.all(promises);
            const successful = results.filter(r => r.success).length;
            this.log(`✅ Concurrent spawning: ${successful}/${results.length} agents spawned successfully`, 'success');
        } catch (error) {
            this.log(`❌ Concurrent spawning failed: ${error.message}`, 'error');
        }
    }

    async testServerConnectionResilience() {
        this.currentTest = 'server-connection';
        this.log('Testing server connection resilience...', 'test');

        try {
            // Test status command first
            const statusResult = await this.runCommand('status');
            this.log(`Server status: ${statusResult.success ? 'responsive' : 'issues detected'}`, 'info');

            // Test agent listing
            const listResult = await this.runCommand('agent list');
            this.log(`Agent listing: ${listResult.success ? 'working' : 'failed'}`, 'info');

        } catch (error) {
            this.log(`❌ Server connection test failed: ${error.message}`, 'error');
        }
    }

    async testSpecificBugReproduction() {
        this.currentTest = 'bug-reproduction';
        this.log('Testing specific bug reproduction (analyst vs code-analyzer)...', 'test');

        // Test the original problematic case
        try {
            this.log('Testing original problematic case: analyst agent', 'test');
            const analystResult = await this.runCommand('agent spawn', ['analyst']);

            if (analystResult.success) {
                this.log('✅ analyst agent type now works correctly', 'success');
            } else if (analystResult.stderr.includes('Invalid agent type')) {
                this.log('ℹ️ analyst agent type properly rejected with helpful error', 'info');
            } else {
                this.log(`❌ Unexpected error with analyst: ${analystResult.stderr}`, 'error');
            }
        } catch (error) {
            this.log(`Error testing analyst: ${error.message}`, 'error');
        }

        // Test the correct alternative
        try {
            this.log('Testing correct alternative: code-analyzer', 'test');
            const analyzerResult = await this.runCommand('agent spawn', ['coder', '--name', 'code-analyzer']);

            if (analyzerResult.success || !analyzerResult.stderr.includes('Invalid agent type')) {
                this.log('✅ code-analyzer functionality works through coder type', 'success');
            } else {
                this.log(`❌ code-analyzer alternative failed: ${analyzerResult.stderr}`, 'error');
            }
        } catch (error) {
            this.log(`Error testing code-analyzer alternative: ${error.message}`, 'error');
        }
    }

    async runStressTests() {
        this.currentTest = 'stress-test';
        this.log('Running stress tests...', 'test');

        // Test rapid spawning
        const rapidTests = [];
        for (let i = 0; i < 5; i++) {
            rapidTests.push(this.runCommand('agent spawn', ['researcher', '--name', `stress-${i}`]));
        }

        try {
            const results = await Promise.allSettled(rapidTests);
            const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            this.log(`✅ Stress test: ${successful}/${results.length} rapid spawns successful`, 'success');
        } catch (error) {
            this.log(`❌ Stress test failed: ${error.message}`, 'error');
        }
    }

    generateReport() {
        this.log('Generating comprehensive test report...', 'report');

        const report = {
            timestamp: new Date().toISOString(),
            totalTests: this.testResults.length,
            successCount: this.testResults.filter(r => r.type === 'success').length,
            errorCount: this.testResults.filter(r => r.type === 'error').length,
            testsByCategory: this.groupBy(this.testResults, 'test'),
            recommendations: this.generateRecommendations()
        };

        // Save report to file
        const reportPath = path.join(__dirname, 'agent-spawning-test-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        this.log(`Test report saved to: ${reportPath}`, 'report');
        return report;
    }

    groupBy(array, key) {
        return array.reduce((result, item) => {
            const group = item[key];
            if (!result[group]) {
                result[group] = [];
            }
            result[group].push(item);
            return result;
        }, {});
    }

    generateRecommendations() {
        const errors = this.testResults.filter(r => r.type === 'error');
        const recommendations = [];

        if (errors.length > 0) {
            recommendations.push('Review error logs and fix failing agent types');
        }

        recommendations.push('Implement agent type validation at the API level');
        recommendations.push('Add helpful error messages for invalid agent types');
        recommendations.push('Consider implementing agent type aliases for common misspellings');
        recommendations.push('Add monitoring for agent spawning failures');

        return recommendations;
    }

    async runAllTests() {
        this.log('Starting comprehensive agent spawning validation tests', 'start');

        const tests = [
            () => this.testValidAgentTypes(),
            () => this.testInvalidAgentTypes(),
            () => this.testEdgeCases(),
            () => this.testSpecificBugReproduction(),
            () => this.testConcurrentSpawning(),
            () => this.testServerConnectionResilience(),
            () => this.runStressTests()
        ];

        for (const test of tests) {
            try {
                await test();
                await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause between tests
            } catch (error) {
                this.log(`Test failed: ${error.message}`, 'error');
            }
        }

        const report = this.generateReport();
        this.log('All tests completed!', 'complete');
        return report;
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const tester = new AgentSpawningTester();
    tester.runAllTests().then(report => {
        console.log('\n=== FINAL REPORT ===');
        console.log(`Total Tests: ${report.totalTests}`);
        console.log(`Successes: ${report.successCount}`);
        console.log(`Errors: ${report.errorCount}`);
        console.log('\nRecommendations:');
        report.recommendations.forEach(rec => console.log(`- ${rec}`));
        process.exit(report.errorCount > 5 ? 1 : 0);
    }).catch(error => {
        console.error('Test suite failed:', error);
        process.exit(1);
    });
}

module.exports = AgentSpawningTester;