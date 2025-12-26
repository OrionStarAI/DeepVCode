# Security Policy

## 🔒 Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## 🛡️ Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

1. **DO NOT** create a public GitHub issue for security vulnerabilities
2. Email us at: **security@deepvlab.ai**
3. Include the following information:
   - Type of vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (optional)

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your report within 48 hours
- **Investigation**: We will investigate and validate the reported issue
- **Updates**: We will keep you informed about the progress
- **Resolution**: We aim to resolve critical issues within 7-14 days
- **Credit**: With your permission, we will credit you in the security advisory

## 🔐 Security Best Practices

When using DeepV Code, we recommend:

### For Users

1. **Keep Updated**: Always use the latest version of DeepV Code
2. **Review Before Execute**: Carefully review AI-suggested shell commands before execution
3. **Use Sandbox Mode**: For untrusted projects, use `dvcode -s` (sandbox mode)
4. **Protect API Keys**: Never commit API keys or tokens to version control
5. **Limit File Access**: Be cautious when granting file system access

### For Contributors

1. **No Secrets in Code**: Never hardcode secrets, API keys, or credentials
2. **Input Validation**: Always validate and sanitize user inputs
3. **Dependency Auditing**: Regularly audit dependencies for vulnerabilities
4. **Code Review**: All changes must go through code review

## 🔍 Security Features

DeepV Code includes several built-in security features:

| Feature | Description |
|:---|:---|
| **Tool Confirmation** | Dangerous operations require user confirmation |
| **Sandbox Mode** | Isolated execution environment |
| **File Backup** | Deleted files are backed up for recovery |
| **Scope Limiting** | AI can only access files within the project directory |
| **Audit Logging** | All tool executions are logged |

## 📋 Security Checklist

Before deploying or using DeepV Code in production:

- [ ] Using latest stable version
- [ ] API keys stored securely (environment variables or secure vault)
- [ ] Reviewed project-specific DEEPV.md for security guidelines
- [ ] Enabled confirmation prompts for destructive operations
- [ ] Configured appropriate file access permissions

## 🔗 Related Resources

- [Terms of Service](https://dvcode.deepvlab.ai/terms)
- [Privacy Policy](https://dvcode.deepvlab.ai/privacy)
- [Apache License 2.0](LICENSE)

---

Thank you for helping keep DeepV Code and our users safe! 🙏
