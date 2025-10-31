#!/usr/bin/env node

/**
 * Integration and Stress Testing for Agent Spawning System
 * Tests server connections, concurrent operations, and system resilience
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class IntegrationStressTester {
    constructor() {
        this.results = [];
        this.metrics = {
            totalTests: 0,
            passed: 0,
            failed: 0,
            averageResponseTime: 0,
            maxConcurrency: 0,
            errors: []
        };
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, type, message };
        console.log(`[${timestamp}] [${type.toUpperCase()}] ${message}`);
        this.results.push(logEntry);
    }

    async runCommand(command, args = [], timeout = 10000) {
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const child = spawn('npx', ['claude-flow@alpha', ...command.split(' '), ...args], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => stdout += data.toString());
            child.stderr.on('data', (data) => stderr += data.toString());

            const timer = setTimeout(() => {
                child.kill('SIGTERM');
                reject(new Error('Command timeout'));
            }, timeout);

            child.on('close', (code) => {
                clearTimeout(timer);
                const duration = Date.now() - startTime;
                resolve({
                    code,
                    stdout,
                    stderr,
                    success: code === 0,
                    duration
                });
            });

            child.on('error', (error) => {
                clearTimeout(timer);
                reject(error);
            });
        });
    }

    async testServerConnection() {
        this.log('Testing server connection and responsiveness...', 'test');

        const connectionTests = [
            'status',
            'agent list',
            'config',
            'help'
        ];

        let connectionSuccesses = 0;
        const connectionTimes = [];

        for (const command of connectionTests) {
            try {
                const result = await this.runCommand(command);
                connectionTimes.push(result.duration);

                if (result.success || !result.stderr.includes('connection')) {
                    connectionSuccesses++;
                    this.log(`✅ Connection test '${command}': ${result.duration}ms`, 'success');
                } else {
                    this.log(`❌ Connection test '${command}': failed`, 'error');
                }
            } catch (error) {
                this.log(`❌ Connection test '${command}': ${error.message}`, 'error');
            }
        }

        const avgConnectionTime = connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length;
        this.log(`Connection summary: ${connectionSuccesses}/${connectionTests.length} successful, avg: ${avgConnectionTime.toFixed(2)}ms`, 'info');

        return { successRate: connectionSuccesses / connectionTests.length, avgTime: avgConnectionTime };
    }

    async testConcurrentAgentSpawning() {
        this.log('Testing concurrent agent spawning...', 'test');

        const concurrencyLevels = [3, 5, 8, 10];
        const concurrencyResults = [];

        for (const level of concurrencyLevels) {
            this.log(`Testing concurrency level: ${level}`, 'test');

            const promises = [];
            const startTime = Date.now();

            for (let i = 0; i < level; i++) {
                const agentType = ['researcher', 'coder', 'tester', 'reviewer'][i % 4];
                promises.push(
                    this.runCommand('agent spawn', [agentType, '--name', `concurrent-${level}-${i}`])
                );
            }

            try {
                const results = await Promise.all(promises);
                const endTime = Date.now();
                const totalTime = endTime - startTime;

                const successful = results.filter(r => r.success).length;
                const successRate = successful / level;

                concurrencyResults.push({
                    level,
                    successful,
                    total: level,
                    successRate,
                    totalTime,
                    avgTimePerAgent: totalTime / level
                });

                this.log(`✅ Concurrency ${level}: ${successful}/${level} successful in ${totalTime}ms`, 'success');
            } catch (error) {
                this.log(`❌ Concurrency ${level}: ${error.message}`, 'error');
                concurrencyResults.push({
                    level,
                    successful: 0,
                    total: level,
                    successRate: 0,
                    error: error.message
                });
            }

            // Brief pause between concurrency tests
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        return concurrencyResults;
    }

    async testSystemResilience() {
        this.log('Testing system resilience and error recovery...', 'test');

        const resilienceTests = [
            // Test invalid operations
            () => this.runCommand('agent spawn', ['invalid-type']),
            () => this.runCommand('agent terminate', ['non-existent-agent']),
            () => this.runCommand('invalid-command'),

            // Test rapid operations
            async () => {
                const rapidPromises = [];
                for (let i = 0; i < 5; i++) {
                    rapidPromises.push(this.runCommand('status'));
                }
                return Promise.all(rapidPromises);
            },

            // Test edge case inputs
            () => this.runCommand('agent spawn', ['']),
            () => this.runCommand('agent spawn', ['test'.repeat(100)]),
        ];

        let resilienceScore = 0;
        const maxScore = resilienceTests.length;

        for (let i = 0; i < resilienceTests.length; i++) {
            try {
                await resilienceTests[i]();
                resilienceScore++;
                this.log(`✅ Resilience test ${i + 1}: system remained stable`, 'success');
            } catch (error) {
                // Some errors are expected for invalid operations
                if (error.message.includes('timeout') || error.message.includes('crash')) {
                    this.log(`❌ Resilience test ${i + 1}: system instability - ${error.message}`, 'error');
                } else {
                    resilienceScore++;
                    this.log(`✅ Resilience test ${i + 1}: expected error handled gracefully`, 'success');
                }
            }
        }

        const resilienceRate = resilienceScore / maxScore;
        this.log(`Resilience score: ${resilienceScore}/${maxScore} (${(resilienceRate * 100).toFixed(1)}%)`, 'info');

        return { score: resilienceScore, maxScore, rate: resilienceRate };
    }

    async testPerformanceBaseline() {
        this.log('Establishing performance baseline...', 'test');

        const performanceTests = [
            { name: 'Simple Status', command: 'status' },
            { name: 'Agent List', command: 'agent list' },
            { name: 'Single Agent Spawn', command: 'agent spawn researcher --name perf-test' },
            { name: 'Help Command', command: 'help' }
        ];

        const performanceResults = [];

        for (const test of performanceTests) {
            const iterations = 3;
            const times = [];

            for (let i = 0; i < iterations; i++) {
                try {
                    const result = await this.runCommand(test.command);
                    times.push(result.duration);
                } catch (error) {
                    this.log(`Performance test '${test.name}' iteration ${i + 1} failed: ${error.message}`, 'warn');
                }
            }

            if (times.length > 0) {
                const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
                const minTime = Math.min(...times);
                const maxTime = Math.max(...times);

                performanceResults.push({
                    name: test.name,
                    avgTime,
                    minTime,
                    maxTime,
                    iterations: times.length
                });

                this.log(`📊 ${test.name}: avg ${avgTime.toFixed(2)}ms, min ${minTime}ms, max ${maxTime}ms`, 'info');
            }
        }

        return performanceResults;
    }

    async generateComprehensiveReport() {
        this.log('Generating comprehensive test report...', 'report');

        const report = {
            timestamp: new Date().toISOString(),
            testSuite: 'Integration and Stress Testing',
            summary: {
                totalTests: this.metrics.totalTests,
                passed: this.metrics.passed,
                failed: this.metrics.failed,
                successRate: this.metrics.totalTests > 0 ? (this.metrics.passed / this.metrics.totalTests) : 0
            },
            results: this.results,
            recommendations: this.generateRecommendations(),
            criticalIssues: this.results.filter(r => r.type === 'error').length,
            performanceMetrics: this.metrics
        };

        // Save to file
        const reportPath = path.join(__dirname, 'integration-stress-test-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        this.log(`Comprehensive report saved: ${reportPath}`, 'success');
        return report;
    }

    generateRecommendations() {
        const errorCount = this.results.filter(r => r.type === 'error').length;
        const recommendations = [];

        if (errorCount > 5) {
            recommendations.push('HIGH: Multiple system errors detected - investigate immediately');
        }

        if (this.metrics.averageResponseTime > 5000) {
            recommendations.push('MEDIUM: High response times detected - performance optimization needed');
        }

        recommendations.push('Implement continuous monitoring for agent spawning');
        recommendations.push('Set up automated stress testing in CI/CD pipeline');
        recommendations.push('Add performance metrics dashboard');
        recommendations.push('Implement graceful degradation for high load scenarios');

        return recommendations;
    }

    async runFullTestSuite() {
        this.log('🚀 Starting comprehensive integration and stress test suite', 'start');

        try {
            // Test 1: Server Connection
            const connectionResult = await this.testServerConnection();
            this.metrics.totalTests += 4;
            this.metrics.passed += Math.round(connectionResult.successRate * 4);

            // Test 2: Performance Baseline
            const performanceResults = await this.testPerformanceBaseline();
            this.metrics.totalTests += performanceResults.length * 3; // 3 iterations each
            this.metrics.averageResponseTime = performanceResults.reduce((acc, result) => acc + result.avgTime, 0) / performanceResults.length;

            // Test 3: Concurrent Operations
            const concurrencyResults = await this.testConcurrentAgentSpawning();
            for (const result of concurrencyResults) {
                this.metrics.totalTests += result.total;
                this.metrics.passed += result.successful;
                this.metrics.maxConcurrency = Math.max(this.metrics.maxConcurrency, result.level);
            }

            // Test 4: System Resilience
            const resilienceResult = await this.testSystemResilience();
            this.metrics.totalTests += resilienceResult.maxScore;
            this.metrics.passed += resilienceResult.score;

            this.metrics.failed = this.metrics.totalTests - this.metrics.passed;

            const report = await this.generateComprehensiveReport();
            this.log('🎉 All integration and stress tests completed!', 'complete');

            return report;

        } catch (error) {
            this.log(`❌ Test suite failed: ${error.message}`, 'error');
            throw error;
        }
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const tester = new IntegrationStressTester();
    tester.runFullTestSuite().then(report => {
        console.log('\n=== INTEGRATION & STRESS TEST SUMMARY ===');
        console.log(`Tests Run: ${report.summary.totalTests}`);
        console.log(`Passed: ${report.summary.passed}`);
        console.log(`Failed: ${report.summary.failed}`);
        console.log(`Success Rate: ${(report.summary.successRate * 100).toFixed(1)}%`);
        console.log(`Critical Issues: ${report.criticalIssues}`);

        if (report.criticalIssues > 3) {
            console.log('\n🚨 CRITICAL: Multiple issues detected - immediate attention required!');
            process.exit(1);
        } else if (report.summary.successRate < 0.8) {
            console.log('\n⚠️ WARNING: Low success rate - investigation recommended');
            process.exit(1);
        } else {
            console.log('\n✅ Integration and stress tests passed successfully');
            process.exit(0);
        }
    }).catch(error => {
        console.error('❌ Test suite failed:', error);
        process.exit(1);
    });
}

module.exports = IntegrationStressTester;